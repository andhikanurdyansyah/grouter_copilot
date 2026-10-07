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

  if (framework.name === 'next') {
    ensureDir('app/api/copilot/chat');
    results.push(writeIfMissing('app/api/copilot/chat/route.js', ROUTE_APP_TEMPLATE));
  } else if (framework.name === 'express') {
    ensureDir('routes');
    results.push(writeIfMissing('routes/copilot.js', ROUTE_EXPRESS_TEMPLATE));
  } else {
    ensureDir('src');
    results.push(writeIfMissing('src/copilot-route.js', ROUTE_EXPRESS_TEMPLATE));
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
    console.log('  2. Mount <CopilotChat /> in your UI');
    console.log('  3. Edit skills/example.js to expose your data');
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
    // Exact-key match only: a substring check would treat GROUTER_LICENSE as
    // "already present" when only GROUTER_LICENSE_PUBLIC_KEY exists, silently
    // dropping the license on install/renewal.
    const existing = readFileSync(full, 'utf8');
    const existingKeys = new Set(
      existing.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => l.split('=')[0].trim()),
    );
    const added = lines.filter((l) => !existingKeys.has(l.split('=')[0]));
    if (added.length) {
      appendFileSync(full, '\n' + added.join('\n') + '\n', 'utf8');
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
  console.log('Mount <CopilotChat /> in your UI and define your read-only skills.');
}

main();
