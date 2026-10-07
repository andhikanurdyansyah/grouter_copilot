#!/usr/bin/env node
/**
 * gRouter Copilot CLI — `npx @grouter/copilot init`.
 * Detects framework and scaffolds config, skills, route, widget, and .env.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } = require('node:fs');
const cwd = process.cwd();

function readPkg() {
  const p = path.join(cwd, 'package.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function detectFramework() {
  const pkg = readPkg();
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  if (deps.next) return { name: 'next', label: 'Next.js', appRouter: hasAppRouter() };
  if (deps.express) return { name: 'express', label: 'Express' };
  return { name: 'node', label: 'Node.js (vanilla)' };
}

function hasAppRouter() {
  return existsSync(path.join(cwd, 'app')) || existsSync(path.join(cwd, 'src/app'));
}

function ensureDir(rel) {
  mkdirSync(path.join(cwd, rel), { recursive: true });
}

function writeIfMissing(rel, content) {
  const full = path.join(cwd, rel);
  if (existsSync(full)) return { rel, skipped: true };
  writeFileSync(full, content, 'utf8');
  return { rel, skipped: false };
}

function routeTarget(framework) {
  if (framework.name === 'next') {
    if (framework.appRouter) return 'app/api/copilot/chat/route.js';
    const pagesDir = existsSync(path.join(cwd, 'src/pages')) ? 'src/pages' : 'pages';
    return path.join(pagesDir, 'api/copilot/chat.js');
  }
  if (framework.name === 'express') return 'routes/copilot.js';
  return 'src/copilot-route.js';
}

const SKILL_TEMPLATE = (name) => `// ${name} skill — example read-only skill.
export default {
  name: "${name}",
  description: "Describe what this skill does so the copilot can pick it.",
  parameters: {
    type: "object",
    properties: {
      // example: period: { type: "string", enum: ["7d", "30d"] }
    },
    required: []
  },
  readOnly: true,
  async run(args, ctx) {
    // Access your own DB/service here. ctx.user holds the current user.
    // Return ONLY the data needed to answer; never secrets or PII.
    return { note: "replace this with real data", user: ctx.user?.id ?? null };
  }
};
`;

const CONFIG_TEMPLATE = `// gRouter Copilot configuration.
// Import your skills and list them below.
import exampleSkill from "./skills/example.js";

export default {
  model: process.env.GROUTER_MODEL || "grouter-default",
  systemPrompt:
    "You are a helpful assistant for this application. Answer only from the data provided. If data is insufficient, say so.",
  skills: [exampleSkill],
  limits: {
    maxRows: 500,
    maxContextBytes: 32000,
    maxTokens: 2000
  },
  adapter: {
    apiKey: process.env.GROUTER_API_KEY,
    baseUrl: process.env.GROUTER_BASE_URL
  }
};
`;

const ROUTE_APP_TEMPLATE = `// gRouter Copilot chat route (Next.js App Router).
import { NextResponse } from "next/server";
import { createCopilot } from "@grouter/copilot";
import path from "node:path";

let copilot;
async function getCopilot() {
  if (!copilot) {
    copilot = await createCopilot({
      configPath: path.join(process.cwd(), "copilot.config.js")
    });
  }
  return copilot;
}

export async function POST(request) {
  const body = await request.json();
  const { runtime } = await getCopilot();
  const result = await runtime.chat(body);
  const status = result.status === "error" ? (result.code === "INVALID_REQUEST" ? 400 : 500) : 200;
  return NextResponse.json(result, { status });
}
`;

const ROUTE_PAGES_TEMPLATE = `// gRouter Copilot chat API route (Next.js Pages Router).
import { createCopilot } from "@grouter/copilot";
import path from "node:path";

let copilot;
async function getCopilot() {
  if (!copilot) copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.js") });
  return copilot;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { runtime } = await getCopilot();
  const result = await runtime.chat(req.body ?? {});
  const status = result.status === "error" ? (result.code === "INVALID_REQUEST" ? 400 : 500) : 200;
  return res.status(status).json(result);
}
`;

const WIDGET_TEMPLATE = `"use client";

import { CopilotChat } from "@grouter/copilot/widget";

export default function CopilotWidget() {
  return <CopilotChat firstUseSetup />;
}
`;

const ROUTE_EXPRESS_TEMPLATE = `// gRouter Copilot chat route (Express).
import { createCopilot } from "@grouter/copilot";
import path from "node:path";

let copilot;
async function getCopilot() {
  if (!copilot) {
    copilot = await createCopilot({
      configPath: path.join(process.cwd(), "copilot.config.js")
    });
  }
  return copilot;
}

export async function copilotHandler(req, res) {
  const { runtime } = await getCopilot();
  const result = await runtime.chat(req.body ?? {});
  const status = result.status === "error" ? (result.code === "INVALID_REQUEST" ? 400 : 500) : 200;
  res.status(status).json(result);
}
`;

const HEALTH_APP_TEMPLATE = `// Host-local Copilot health (Next.js App Router).
import { NextResponse } from "next/server";
import { createCopilot, getCopilotHealth } from "@grouter/copilot";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.js") });
    const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE);
    return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
`;

const HEALTH_PAGES_TEMPLATE = `// Host-local Copilot health (Next.js Pages Router).
import { createCopilot, getCopilotHealth } from "@grouter/copilot";
import path from "node:path";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.js") });
    const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE);
    return res.status(health.status === "ok" ? 200 : 503).json(health);
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
}
`;

const HEALTH_NODE_TEMPLATE = `// Host-local Copilot health. Mount this GET handler at /api/copilot/health.
import { createCopilot, getCopilotHealth } from "@grouter/copilot";
import path from "node:path";

export async function copilotHealthHandler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.js") });
    const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE);
    return res.status(health.status === "ok" ? 200 : 503).json(health);
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
}
`;

function runInit(opts = {}, { silent = false } = {}) {
  const framework = detectFramework();
  const results = [];

  if (!silent) {
    console.log(`✔ Detected ${framework.label}`);
    if (framework.name === 'next') {
      console.log(framework.appRouter ? '  App Router layout' : '  Pages Router layout');
    }
  }

  results.push(writeIfMissing('copilot.config.js', CONFIG_TEMPLATE));
  ensureDir('skills');
  results.push(writeIfMissing('skills/example.js', SKILL_TEMPLATE('example')));

  const target = routeTarget(framework);
  const template = framework.name === 'next' && !framework.appRouter
    ? ROUTE_PAGES_TEMPLATE
    : framework.name === 'next' ? ROUTE_APP_TEMPLATE : ROUTE_EXPRESS_TEMPLATE;
  ensureDir(path.dirname(target));
  results.push(writeIfMissing(target, template));

  const healthTarget = framework.name === 'next'
    ? (framework.appRouter ? 'app/api/copilot/health/route.js' : path.join(path.dirname(target), 'health.js'))
    : framework.name === 'express' ? 'routes/copilot-health.js' : 'src/copilot-health.js';
  ensureDir(path.dirname(healthTarget));
  results.push(writeIfMissing(healthTarget, framework.name === 'next'
    ? (framework.appRouter ? HEALTH_APP_TEMPLATE : HEALTH_PAGES_TEMPLATE) : HEALTH_NODE_TEMPLATE));

  if (framework.name === 'next') {
    ensureDir('components');
    results.push(writeIfMissing('components/CopilotWidget.jsx', WIDGET_TEMPLATE));
  }

  const envResult = writeEnv(opts);
  if (envResult) results.push(envResult);

  if (!silent) {
    console.log('');
    for (const r of results) {
      console.log(`${r.skipped ? '· (exists)' : '✔ Created'} ${r.rel}`);
    }
    console.log('');
    console.log('Next:');
    console.log('  1. Verify GROUTER_LICENSE and GROUTER_LICENSE_SERVER in .env');
    console.log('  2. Mount <CopilotWidget /> from components/CopilotWidget.jsx in your app layout');
    console.log('  3. Edit skills/example.js to expose your data');
    if (framework.name !== 'next') console.log('  4. Mount copilotHealthHandler at GET /api/copilot/health in your host server');
  }

  return results;
}

function writeEnv(opts = {}) {
  const rel = '.env';
  const full = path.join(cwd, rel);
  const lines = [];
  if (opts.baseUrl) lines.push(`GROUTER_BASE_URL=${opts.baseUrl}`);
  if (opts.apiKey) lines.push(`GROUTER_API_KEY=${opts.apiKey}`);
  if (opts.license) lines.push(`GROUTER_LICENSE=${opts.license}`);
  if (opts.licenseServerUrl) lines.push(`GROUTER_LICENSE_SERVER=${opts.licenseServerUrl}`);
  if (opts.licensePublicKey) lines.push(`GROUTER_LICENSE_PUBLIC_KEY=${opts.licensePublicKey.replace(/\n/g, '\\n')}`);
  if (lines.length === 0) return null;

  if (existsSync(full)) {
    const existing = readFileSync(full, 'utf8');
    const keys = new Set(lines.map((line) => line.slice(0, line.indexOf('='))));
    const updated = [];
    let changed = false;
    const seen = new Set();
    for (const line of existing.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      const key = match?.[1];
      if (!key || !keys.has(key)) {
        updated.push(line);
        continue;
      }
      if (seen.has(key)) {
        changed = true;
        continue;
      }
      seen.add(key);
      const replacement = lines.find((entry) => entry.startsWith(`${key}=`));
      updated.push(replacement);
      changed ||= line.trim() !== replacement;
    }
    for (const line of lines) {
      const key = line.slice(0, line.indexOf('='));
      if (!seen.has(key)) { updated.push(line); changed = true; }
    }
    if (changed) {
      writeFileSync(full, updated.join('\n').replace(/\n*$/, '\n'), 'utf8');
      return { rel, skipped: false };
    }
    return null;
  }
  writeFileSync(full, lines.join('\n') + '\n', 'utf8');
  return { rel, skipped: false };
}

function parseFlags(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--license') opts.license = next;
    else if (a === '--license-server' || a === '--licenseServer') opts.licenseServerUrl = next;
  }
  return opts;
}

function main() {
  const cmd = process.argv[2];
  const argv = process.argv.slice(3);

  if (cmd === 'init') {
    runInit();
    return;
  }
  if (!cmd) {
    runInit();
    return;
  }
  if (cmd === 'install') {
    runInstall(parseFlags(argv));
    return;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log('Usage:');
    console.log('  grouter-copilot init');
    console.log('  grouter-copilot install --license <license-token> [--license-server <url>]');
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

/**
 * Install mode: scaffold, exchange the Copilot license for a server-resolved
 * provider credential, and persist credentials in the server-side app .env.
 */
async function runInstall(opts = {}) {
  const missing = [];
  if (!opts.license) missing.push('--license');
  const licenseServerUrl = opts.licenseServerUrl || process.env.GROUTER_LICENSE_SERVER || 'https://copilot.grouter.id';
  if (missing.length) {
    console.error('Usage: grouter-copilot install --license <license-token> [--license-server <url>]');
    console.error(`Missing required option: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  let resolved;
  try {
    const response = await fetch(new URL('/api/resolve', licenseServerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: opts.license }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.apiKey !== 'string' || !body.apiKey || typeof body.baseUrl !== 'string' || !body.baseUrl || typeof body.licensePublicKey !== 'string' || !body.licensePublicKey) {
      throw new Error(response.status === 404 ? 'This license is not activated yet. Contact support.' : 'License verification failed. Check the license and try again.');
    }
    resolved = body;
  } catch (err) {
    console.error(`License verification failed: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const results = runInit({}, { silent: true });
  console.log('gRouter Copilot — install');
  console.log('');
  for (const r of results) console.log(`${r.skipped ? '· (exists)' : '✔ Created'} ${r.rel}`);

  const envResult = writeEnv({
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    license: opts.license,
    licenseServerUrl,
    licensePublicKey: resolved.licensePublicKey,
  });
  if (envResult) console.log(`✔ Saved server-side app credentials to ${envResult.rel}`);
  console.log('');
  console.log('Done. Provider credentials were resolved by the Copilot license server and were not printed.');
  console.log('✔ Detected framework and generated a server-side chat route');
  console.log('Next: edit skills/example.js with explicitly approved read-only data, mount CopilotWidget from components/CopilotWidget.jsx in your app layout, and connect the generated route from your server.');
}

main();
