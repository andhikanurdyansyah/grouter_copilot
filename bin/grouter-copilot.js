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

/**
 * Detect the host project's module system from package.json `type`.
 * 'module' for ESM, 'commonjs' otherwise (Node's default when `type` is absent).
 * D3: scaffolding ESM files into a CommonJS project makes the host fail at boot
 * with "Cannot use import statement outside a module". We therefore pick both
 * the file EXTENSION and the template variant to match the host.
 */
function detectModuleType() {
  const pkg = readPkg();
  return pkg?.type === 'module' ? 'module' : 'commonjs';
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
  // TANPA override model: gateway memakai model default paket lisensi
  // (server-side policy). Set model hanya jika ada di allowlist paket Anda,
  // atau via env GROUTER_MODEL. Placeholder "grouter-default" DITOLAK upstream.
  model: process.env.GROUTER_MODEL || undefined,
  systemPrompt:
    "You are a helpful assistant for this application. Answer only from the data provided. If data is insufficient, say so.",
  skills: [exampleSkill],
  limits: {
    maxRows: 500,
    maxContextBytes: 32000,
    maxTokens: 2000
  }
};
// NOTE (D-021): no adapter credentials here. The gRouter service credential
// lives ONLY in the Copilot backend; your app calls the backend gateway.
`;

const ROUTE_APP_TEMPLATE = `// gRouter Copilot chat route (Next.js App Router) — D-021 gateway mode.
import { NextResponse } from "next/server";
import { createCopilot, gatewayChat } from "@grouter/copilot";
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

// The Copilot backend that owns the gRouter service credential (server-side).
const GATEWAY_URL = process.env.GROUTER_GATEWAY_URL || "https://copilot.grouter.id/api/copilot/chat";

export async function POST(request) {
  const body = await request.json();
  const { runtime } = await getCopilot();
  let result;
  try {
    result = await gatewayChat({ runtime, gatewayUrl: GATEWAY_URL, ...body });
  } catch (err) {
    // Never let a failed gateway crash the host process — but do NOT flatten
    // every failure into "unreachable". A missing license verifier, an invalid
    // request or a missing message are local configuration/validation errors,
    // and reporting them as UPSTREAM_UNAVAILABLE sent operators to debug the
    // network while the real fault was in their own env.
    result = {
      status: "error",
      code: err?.code || "UPSTREAM_UNAVAILABLE",
      message: err?.message || "Unable to reach the Copilot gateway.",
      retryable: err?.retryable ?? true,
    };
  }
  const status = result.status === "error"
    ? (result.code === "INVALID_REQUEST" ? 400 : result.code === "NOT_CONFIGURED" ? 500 : 502)
    : 200;
  return NextResponse.json(result, { status });
}
`;

const ROUTE_PAGES_TEMPLATE = `// gRouter Copilot chat API route (Next.js Pages Router) — D-021 gateway mode.
import { createCopilot, gatewayChat } from "@grouter/copilot";
import path from "node:path";

let copilot;
async function getCopilot() {
  if (!copilot) copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.js") });
  return copilot;
}

// The Copilot backend that owns the gRouter service credential (server-side).
const GATEWAY_URL = process.env.GROUTER_GATEWAY_URL || "https://copilot.grouter.id/api/copilot/chat";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { runtime } = await getCopilot();
  let result;
  try {
    result = await gatewayChat({ runtime, gatewayUrl: GATEWAY_URL, ...(req.body ?? {}) });
  } catch (err) {
    // Never let a failed gateway crash the host process — but do NOT flatten
    // every failure into "unreachable". A missing license verifier, an invalid
    // request or a missing message are local configuration/validation errors,
    // and reporting them as UPSTREAM_UNAVAILABLE sent operators to debug the
    // network while the real fault was in their own env.
    result = {
      status: "error",
      code: err?.code || "UPSTREAM_UNAVAILABLE",
      message: err?.message || "Unable to reach the Copilot gateway.",
      retryable: err?.retryable ?? true,
    };
  }
  const status = result.status === "error"
    ? (result.code === "INVALID_REQUEST" ? 400 : result.code === "NOT_CONFIGURED" ? 500 : 502)
    : 200;
  return res.status(status).json(result);
}
`;

const WIDGET_TEMPLATE = `"use client";

import { CopilotChat } from "@grouter/copilot/widget";

export default function CopilotWidget() {
  return <CopilotChat firstUseSetup />;
}
`;

const ROUTE_EXPRESS_TEMPLATE = `// gRouter Copilot chat route — D-021 gateway mode.
// Works on Express AND on plain node:http (res.status/res.json are shimmed below).
import { createCopilot, gatewayChat } from "@grouter/copilot";
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

// The Copilot backend that owns the gRouter service credential (server-side).
const GATEWAY_URL = process.env.GROUTER_GATEWAY_URL || "https://copilot.grouter.id/api/copilot/chat";

// Express sets res.status()/res.json(); plain node:http does not. Shim them so this
// handler runs on both (mount it from http.createServer or app.post).
function ensureExpressLike(res) {
  if (typeof res.status !== "function") {
    res.status = (code) => { res.statusCode = code; return res; };
  }
  if (typeof res.json !== "function") {
    res.json = (obj) => {
      if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
  }
  return res;
}

export async function copilotHandler(req, res) {
  ensureExpressLike(res);
  const { runtime } = await getCopilot();
  let result;
  try {
    result = await gatewayChat({ runtime, gatewayUrl: GATEWAY_URL, ...(req.body ?? {}) });
  } catch (err) {
    // Never let a failed gateway crash the host process — but do NOT flatten
    // every failure into "unreachable". A missing license verifier, an invalid
    // request or a missing message are local configuration/validation errors,
    // and reporting them as UPSTREAM_UNAVAILABLE sent operators to debug the
    // network while the real fault was in their own env.
    result = {
      status: "error",
      code: err?.code || "UPSTREAM_UNAVAILABLE",
      message: err?.message || "Unable to reach the Copilot gateway.",
      retryable: err?.retryable ?? true,
    };
  }
  const status = result.status === "error"
    ? (result.code === "INVALID_REQUEST" ? 400 : result.code === "NOT_CONFIGURED" ? 500 : 502)
    : 200;
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
// Works on plain node:http (call it from http.createServer) AND on Express.
import { createCopilot, getCopilotHealth } from "@grouter/copilot";
import path from "node:path";

// Express sets res.status()/res.json(); plain node:http does not. Shim them so the
// same handler runs on both — without this, plain node:http throws
// "TypeError: res.status is not a function".
function ensureExpressLike(res) {
  if (typeof res.status !== "function") {
    res.status = (code) => { res.statusCode = code; return res; };
  }
  if (typeof res.json !== "function") {
    res.json = (obj) => {
      if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
  }
  return res;
}

export async function copilotHealthHandler(req, res) {
  ensureExpressLike(res);
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

// ---- CommonJS variants (D3) --------------------------------------------------
// When the host project is CommonJS we must NOT scaffold ESM. These `.cjs`
// templates use require()/dynamic import() so they load in a CJS host.

const CONFIG_TEMPLATE_CJS = `// gRouter Copilot configuration (CommonJS).
// @grouter/copilot ships as ESM, so load it with dynamic import() from CJS.
module.exports = {
  // TANPA override model: gateway memakai model default paket lisensi
  // (server-side policy). Set model hanya jika ada di allowlist paket Anda,
  // atau via env GROUTER_MODEL.
  model: process.env.GROUTER_MODEL || undefined,
  systemPrompt:
    "You are a helpful assistant for this application. Answer only from the data provided. If data is insufficient, say so.",
  skills: [require("./skills/example.cjs")],
  limits: {
    maxRows: 500,
    maxContextBytes: 32000,
    maxTokens: 2000
  }
};
// NOTE (D-021): no adapter credentials here. The gRouter service credential
// lives ONLY in the Copilot backend; your app calls the backend gateway.
`;

const SKILL_TEMPLATE_CJS = (name) => `// ${name} skill — example read-only skill (CommonJS).
module.exports = {
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

const ROUTE_NODE_CJS_TEMPLATE = `// gRouter Copilot chat route — D-021 gateway mode (CommonJS).
// Works on Express AND on plain node:http (res.status/res.json are shimmed below).
const path = require("node:path");

let copilot;
async function getCopilot() {
  if (!copilot) {
    const { createCopilot } = await import("@grouter/copilot");
    copilot = await createCopilot({
      configPath: path.join(process.cwd(), "copilot.config.cjs")
    });
  }
  return copilot;
}

// The Copilot backend that owns the gRouter service credential (server-side).
const GATEWAY_URL = process.env.GROUTER_GATEWAY_URL || "https://copilot.grouter.id/api/copilot/chat";

// Express sets res.status()/res.json(); plain node:http does not. Shim them so this
// handler runs on both (mount it from http.createServer or app.post).
function ensureExpressLike(res) {
  if (typeof res.status !== "function") {
    res.status = (code) => { res.statusCode = code; return res; };
  }
  if (typeof res.json !== "function") {
    res.json = (obj) => {
      if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
  }
  return res;
}

async function copilotHandler(req, res) {
  ensureExpressLike(res);
  const { runtime } = await getCopilot();
  const { gatewayChat } = await import("@grouter/copilot");
  let result;
  try {
    result = await gatewayChat({ runtime, gatewayUrl: GATEWAY_URL, ...(req.body ?? {}) });
  } catch (err) {
    // Never let a failed gateway crash the host process — but do NOT flatten
    // every failure into "unreachable". A missing license verifier, an invalid
    // request or a missing message are local configuration/validation errors,
    // and reporting them as UPSTREAM_UNAVAILABLE sent operators to debug the
    // network while the real fault was in their own env.
    result = {
      status: "error",
      code: err?.code || "UPSTREAM_UNAVAILABLE",
      message: err?.message || "Unable to reach the Copilot gateway.",
      retryable: err?.retryable ?? true,
    };
  }
  const status = result.status === "error"
    ? (result.code === "INVALID_REQUEST" ? 400 : result.code === "NOT_CONFIGURED" ? 500 : 502)
    : 200;
  res.status(status).json(result);
}

module.exports = { copilotHandler };
`;

const HEALTH_NODE_CJS_TEMPLATE = `// Host-local Copilot health — CommonJS.
// Mount this GET handler at /api/copilot/health.
// Works on plain node:http (call it from http.createServer) AND on Express.
const path = require("node:path");

// Express sets res.status()/res.json(); plain node:http does not. Shim them so the
// same handler runs on both — without this, plain node:http throws
// "TypeError: res.status is not a function".
function ensureExpressLike(res) {
  if (typeof res.status !== "function") {
    res.status = (code) => { res.statusCode = code; return res; };
  }
  if (typeof res.json !== "function") {
    res.json = (obj) => {
      if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(obj));
      return res;
    };
  }
  return res;
}

async function copilotHealthHandler(req, res) {
  ensureExpressLike(res);
  res.setHeader("cache-control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { createCopilot, getCopilotHealth } = await import("@grouter/copilot");
    const copilot = await createCopilot({ configPath: path.join(process.cwd(), "copilot.config.cjs") });
    const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE);
    return res.status(health.status === "ok" ? 200 : 503).json(health);
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
}

module.exports = { copilotHealthHandler };
`;

/**
 * Mask a credential-shaped value for display. The full value must NEVER be
 * printed by the CLI — logs, CI output, and terminal scrollback are shared.
 */
function maskToken(value) {
  if (!value || typeof value !== 'string') return '****';
  return value.length >= 8 ? `****…${value.slice(-4)}` : '****';
}

function frameworkNote(framework) {
  return framework.name === 'next'
    ? ` (${framework.appRouter ? 'App Router layout' : 'Pages Router layout'})`
    : '';
}

function printNextSteps(framework, { installed }) {
  const steps = [];
  if (installed) {
    steps.push(
      'Load the new .env before starting your app — Node does NOT read .env automatically.\n' +
      '  Node >= 20.6:  node --env-file=.env <your-server.js>\n' +
      '  Node <  20.6:  load the env yourself (e.g. dotenv) BEFORE importing Copilot.\n' +
      '  Skipping this shows as health 503 {"license":false,"provider":false}.'
    );
  } else {
    steps.push(
      'Add your license to the server-side environment (.env) — never in browser code or git:\n' +
      '  GROUTER_LICENSE=<your-license-token>\n' +
      '  Or let the installer validate and write it for you:\n' +
      '  npx @grouter/copilot install --license <your-license-token>'
    );
  }
  if (framework.name === 'next') {
    steps.push('Mount the widget in your app layout: <CopilotWidget /> from components/CopilotWidget.jsx.');
  } else {
    steps.push(
      `Wire the chat route: mount copilotHandler from ${routeTarget(framework)} at POST /api/copilot/chat in your server.\n` +
      'These handlers run on plain node:http (no Express required) and on Express.\n' +
      'If your UI is React, render CopilotChat from "@grouter/copilot/widget" in your own wrapper component.'
    );
  }
  steps.push('Edit skills/example.js to expose only data you explicitly approve (read-only).');
  steps.push('Verify: GET /api/copilot/health on your app returns {"status":"ok"}.');
  console.log('Next steps:');
  steps.forEach((step, i) => {
    const [first, ...rest] = step.split('\n');
    console.log(`  ${i + 1}. ${first}`);
    for (const line of rest) console.log(`     ${line}`);
  });
}

function runInit(opts = {}, { silent = false } = {}) {
  const framework = detectFramework();
  const results = [];

  if (!silent) {
    console.log('gRouter Copilot — init');
    console.log('');
    console.log('→ Detecting framework…');
    console.log(`✔ Framework detected: ${framework.label}${frameworkNote(framework)}`);
  }

  // D3: match the host project's module system. Next.js is ESM-only, so its
  // templates never change; for Node/Express we pick ESM (.js) vs CJS (.cjs).
  const modType = detectModuleType();
  const isCjs = framework.name !== 'next' && modType === 'commonjs';

  results.push(writeIfMissing(isCjs ? 'copilot.config.cjs' : 'copilot.config.js',
    isCjs ? CONFIG_TEMPLATE_CJS : CONFIG_TEMPLATE));
  ensureDir('skills');
  results.push(writeIfMissing(isCjs ? 'skills/example.cjs' : 'skills/example.js',
    isCjs ? SKILL_TEMPLATE_CJS('example') : SKILL_TEMPLATE('example')));

  const target = isCjs
    ? routeTarget(framework).replace(/\.js$/, '.cjs')
    : routeTarget(framework);
  const template = framework.name === 'next' && !framework.appRouter
    ? ROUTE_PAGES_TEMPLATE
    : framework.name === 'next' ? ROUTE_APP_TEMPLATE
    : isCjs ? ROUTE_NODE_CJS_TEMPLATE : ROUTE_EXPRESS_TEMPLATE;
  ensureDir(path.dirname(target));
  results.push(writeIfMissing(target, template));

  const healthTarget = framework.name === 'next'
    ? (framework.appRouter ? 'app/api/copilot/health/route.js' : path.join(path.dirname(target), 'health.js'))
    : framework.name === 'express' ? (isCjs ? 'routes/copilot-health.cjs' : 'routes/copilot-health.js')
    : (isCjs ? 'src/copilot-health.cjs' : 'src/copilot-health.js');
  ensureDir(path.dirname(healthTarget));
  results.push(writeIfMissing(healthTarget, framework.name === 'next'
    ? (framework.appRouter ? HEALTH_APP_TEMPLATE : HEALTH_PAGES_TEMPLATE)
    : isCjs ? HEALTH_NODE_CJS_TEMPLATE : HEALTH_NODE_TEMPLATE));

  if (framework.name === 'next') {
    ensureDir('components');
    results.push(writeIfMissing('components/CopilotWidget.jsx', WIDGET_TEMPLATE));
  }

  const envResult = writeEnv(opts);
  if (envResult) results.push(envResult);

  if (!silent) {
    console.log('');
    console.log('→ Writing project files…');
    for (const r of results) {
      console.log(`${r.skipped ? '· Skipped (already exists)' : '✔ Created'} ${r.rel}`);
    }
    console.log('');
    printNextSteps(framework, { installed: false });
  }

  return results;
}

function writeEnv(opts = {}) {
  const rel = '.env';
  const full = path.join(cwd, rel);
  const lines = [];
  // D-021: NO provider credentials here. GROUTER_API_KEY/GROUTER_BASE_URL are
  // server-side Copilot backend configuration only. The host app stores its
  // license, the gateway URL, and the PUBLIC verifier key — nothing secret.
  if (opts.gatewayUrl) lines.push(`GROUTER_GATEWAY_URL=${opts.gatewayUrl}`);
  if (opts.license) lines.push(`GROUTER_LICENSE=${opts.license}`);
  if (opts.licenseServerUrl) lines.push(`GROUTER_LICENSE_SERVER=${opts.licenseServerUrl}`);
  if (opts.licensePublicKey) lines.push(`GROUTER_LICENSE_PUBLIC_KEY=${opts.licensePublicKey.replace(/\n/g, '\\n')}`);
  if (lines.length === 0) return null;
  const keys = lines.map((line) => line.slice(0, line.indexOf('=')));

  if (existsSync(full)) {
    const existing = readFileSync(full, 'utf8');
    const updated = [];
    let changed = false;
    const seen = new Set();
    for (const line of existing.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      const key = match?.[1];
      if (!key || !keys.includes(key)) {
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
      return { rel, skipped: false, action: 'updated', keys };
    }
    return { rel, skipped: true, action: 'unchanged', keys };
  }
  writeFileSync(full, lines.join('\n') + '\n', 'utf8');
  return { rel, skipped: false, action: 'created', keys };
}

function parseFlags(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--license') opts.license = next;
    else if (a === '--license-server' || a === '--licenseServer') opts.licenseServerUrl = next;
    else if (a === '--port') opts.port = next;
    else if (a === '--gateway-url' || a === '--gatewayUrl') opts.gatewayUrl = next;
    else if (a === '--config') opts.configPath = next;
  }
  return opts;
}

/** Minimal .env loader (zero-dep). Does NOT override existing process.env. */
function loadEnvFile(file) {
  try {
    const src = readFileSync(file, 'utf8');
    for (const line of src.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      v = v.replace(/\\n/g, '\n');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch { /* unreadable .env — proceed with current env */ }
}

/** POST /api/resolve to the license server; returns {baseUrl, gatewayUrl?, licensePublicKey}. */
async function resolveLicenseToken(token, licenseServerUrl) {
  const response = await fetch(new URL('/api/resolve', licenseServerUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const body = await response.json().catch(() => ({}));
  if (typeof body.apiKey === 'string' && body.apiKey) {
    throw Object.assign(new Error('Server tried to hand off a provider credential; refusing (D-021). Update the license server.'), { installNoFix: true });
  }
  if (!response.ok || typeof body.baseUrl !== 'string' || !body.baseUrl || typeof body.licensePublicKey !== 'string' || !body.licensePublicKey) {
    throw Object.assign(new Error(), { installStatus: response.status, installServerError: typeof body.error === 'string' ? body.error : undefined });
  }
  return body;
}

async function runServe(opts = {}) {
  loadEnvFile('.env');
  const port = Number(opts.port || process.env.GROUTER_SIDECAR_PORT || 4700);
  let gatewayUrl = opts.gatewayUrl || process.env.GROUTER_GATEWAY_URL || 'https://copilot.grouter.id/api/copilot/chat';
  const licenseServerUrl = opts.licenseServerUrl || process.env.GROUTER_LICENSE_SERVER || 'https://copilot.grouter.id';

  // One-command provisioning: --license resolves once, writes .env (license +
  // verifier public key + gateway URL are SERVER-SIDE ONLY, never shipped to
  // the browser), and scaffolds copilot.config.cjs + example skill if missing.
  if (opts.license && !process.env.GROUTER_LICENSE) {
    console.log('gRouter Copilot sidecar — provisioning from --license…');
    try {
      const resolved = await resolveLicenseToken(opts.license, licenseServerUrl);
      gatewayUrl = resolved.gatewayUrl || new URL('/api/copilot/chat', licenseServerUrl).href;
      process.env.GROUTER_LICENSE = opts.license;
      process.env.GROUTER_LICENSE_PUBLIC_KEY = resolved.licensePublicKey;
      writeEnv({ gatewayUrl, license: opts.license, licenseServerUrl, licensePublicKey: resolved.licensePublicKey });
      console.log('✔ License valid — .env written (license + verifier public key, server-side only)');
    } catch (err) {
      console.error(`✗ License validation failed — ${err.message}`);
      console.error('  Fix: re-run with the FULL license token from your dashboard, or keep GROUTER_LICENSE in .env.');
      process.exitCode = 1;
      return;
    }
  }

  // Scaffold a minimal config + example skill when none exists so first run
  // never dead-ends on "config not found" (edit skills afterwards to expose
  // only the data you approve — read-only).
  if (!existsSync('copilot.config.cjs') && !existsSync('copilot.config.mjs') && !existsSync('copilot.config.js')) {
    console.log('→ No copilot.config found — scaffolding starter config + example skill (edit skills/example.cjs later).');
    const results = runInit({}, { silent: true });
    const cfg = results.find(r => r.rel && r.rel.startsWith('copilot.config'));
    if (!cfg || cfg.action === 'skipped') {
      // runInit may target framework-specific files; for sidecar just copy minimal config
    }
  }
  if (!existsSync('copilot.config.cjs') && !existsSync('copilot.config.mjs') && !existsSync('copilot.config.js')) {
    writeIfMissing('copilot.config.cjs', CONFIG_TEMPLATE_CJS);
    writeIfMissing('skills/example.cjs', SKILL_TEMPLATE_CJS('example'));
    console.log('✔ Created copilot.config.cjs + skills/example.cjs (read-only starter — edit to expose your data)');
  }

  printSidecarBanner(`${gatewayUrl}`);
  try {
    const { startSidecar } = await import('../src/sidecar/server.js');
    const server = await startSidecar({ port, gatewayUrl, configPath: opts.configPath });
    const addr = server.address();
    console.log(`  chat   POST http://localhost:${addr.port}/api/copilot/chat`);
    console.log(`  health GET  http://localhost:${addr.port}/api/copilot/health`);
    console.log(`  widget GET  http://localhost:${addr.port}/copilot.js`);
    console.log('');
    console.log('  Embed tag for your app (any stack):');
    const pub = process.env.GROUTER_SIDECAR_PUBLIC_URL || `http://localhost:${addr.port}`;
    console.log(`    <link rel="stylesheet" href="${pub}/copilot.css">`);
    console.log(`    <script src="${pub}/copilot.js"></script>`);
    console.log('');
    console.log('  Ctrl+C to stop. Keep this process running (pm2/docker recommended).');
  } catch (err) {
    console.error(`sidecar failed: ${err.message}`);
    process.exit(1);
  }
}

function printSidecarBanner(gw) {
  console.log('gRouter Copilot sidecar (zero-code embed, any stack)');
  console.log(`  gateway: ${gw}`);
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
  if (cmd === 'serve') {
    const opts = parseFlags(argv);
    runServe(opts);
    return;
  }
  if (cmd === 'install') {
    runInstall(parseFlags(argv));
    return;
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    // Read from package.json so the CLI can never disagree with the published
    // package version. `--version` was previously an unknown command, which
    // breaks the most basic `npx` sanity check a new user runs first.
    const pkgPath = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(pkg.version);
    return;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log('Usage:');
    console.log('  grouter-copilot init');
    console.log('  grouter-copilot install --license <license-token> [--license-server <url>]');
  console.log('  grouter-copilot serve [--port 4700]');
    console.log('');
    console.log('Commands:');
    console.log('  init      Scaffold config, skills, chat route, health route, and widget for the detected framework. No license needed.');
  console.log('  serve     Run a standalone Copilot sidecar (chat+health+embed widget) — zero-code embed for ANY stack.');
    console.log('  install   Validate the license against the license server, scaffold the same files, and write the gateway configuration to .env.');
    console.log('');
    console.log('Options:');
    console.log('  --license <token>          Copilot license token issued for your account (required for install).');
  console.log('  --port <n>                 Sidecar port (serve). Default 4700 (or GROUTER_SIDECAR_PORT).');
    console.log('  --license-server <url>     License server base URL. Default: https://copilot.grouter.id (or GROUTER_LICENSE_SERVER).');
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  console.error('Run `grouter-copilot --help` to list valid commands (init, install).');
  process.exit(1);
}

/**
 * Classify a license-server failure into an actionable error message
 * (cause + how to fix) without ever echoing the license token itself.
 */
function installFailure({ status, serverError, cause }) {
  const fix = (text) => `Fix: ${text}`;
  if (status === 404 || /not activated/i.test(serverError ?? '')) {
    return {
      reason: 'License not activated',
      detail: 'The license server accepted the token format but no gRouter provider key is bound to it yet.',
      fix: fix('ask the gRouter operator to bind a provider key to this license (admin console → Licenses → Bind), then run the installer again.'),
    };
  }
  if (status === 403 || status === 401) {
    return {
      reason: 'License rejected by the server',
      detail: serverError || 'The license server refused this token (invalid, expired, or revoked).',
      fix: fix('copy the token again from the customer dashboard (copy the FULL token, it is shown once) and re-run the install command. If it still fails, request a new license.'),
    };
  }
  if (status === 429) {
    return {
      reason: 'Rate limited',
      detail: 'Too many activation attempts from this machine in a short window.',
      fix: fix('wait a minute and re-run the same command; the token is unchanged.'),
    };
  }
  if (status === 402) {
    return {
      reason: 'Payment pending',
      detail: 'The license is tied to an order that has not been paid/settled yet.',
      fix: fix('complete the QRIS payment or ask the operator to settle the order, then re-run the install command.'),
    };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return {
      reason: 'License server error',
      detail: serverError || `The license server responded with HTTP ${status}.`,
      fix: fix(`check https://copilot.grouter.id is reachable${status === 503 ? ' (the backend may be restarting)' : ''} and retry; if it persists, contact support with the time of the attempt.`),
    };
  }
  if (status) {
    return {
      reason: 'License verification failed',
      detail: serverError || `The license server responded with HTTP ${status}.`,
      fix: fix('verify the token and the --license-server URL, then re-run the install command.'),
    };
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(cause ?? '')) {
    return {
      reason: 'Cannot reach the license server',
      detail: `Network error while calling the license server (${cause}).`,
      fix: fix('check your internet connection and any corporate proxy/firewall, verify the --license-server URL is correct, then retry.'),
    };
  }
  if (/abort/i.test(cause ?? '')) {
    return {
      reason: 'License server request timed out',
      detail: 'The license server did not answer in time.',
      fix: fix('retry the same command; if it keeps timing out, check your network or the license server status.'),
    };
  }
  return {
    reason: 'License verification failed',
    detail: cause || 'Unexpected response from the license server.',
    fix: fix('verify the token and the --license-server URL, then re-run the install command. If it persists, contact support with this output.'),
  };
}

/**
 * Install mode: scaffold and exchange the Copilot license for NON-SECRET
 * configuration (gateway URL + public verifier key). D-021: the gRouter
 * service credential is NEVER handed to the customer app.
 */
async function runInstall(opts = {}) {
  const missing = [];
  if (!opts.license) missing.push('--license');
  const licenseServerUrl = opts.licenseServerUrl || process.env.GROUTER_LICENSE_SERVER || 'https://copilot.grouter.id';
  if (missing.length) {
    console.error('Usage: grouter-copilot install --license <license-token> [--license-server <url>]');
    console.error('');
    console.error('Missing required option: --license <license-token>');
    console.error('Where to find it: your Copilot license token is shown once when issued (customer dashboard or by the gRouter operator). Copy the FULL token.');
    console.error('Fix: re-run with --license <your-license-token>. To scaffold without a license, use `grouter-copilot init`.');
    process.exitCode = 1;
    return;
  }

  console.log('gRouter Copilot — install');
  console.log('');
  console.log('→ Validating license…');

  let resolved;
  try {
    const response = await fetch(new URL('/api/resolve', licenseServerUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: opts.license }),
    });
    const body = await response.json().catch(() => ({}));
    // D-021: the resolve payload no longer contains an apiKey (and never may).
    if (!response.ok || typeof body.baseUrl !== 'string' || !body.baseUrl || typeof body.licensePublicKey !== 'string' || !body.licensePublicKey) {
      throw Object.assign(new Error(), { installStatus: response.status, installServerError: typeof body.error === 'string' ? body.error : undefined });
    }
    if (typeof body.apiKey === 'string' && body.apiKey) {
      // Defense in depth: refuse payloads that still try to hand off a key.
      throw Object.assign(new Error('Server tried to hand off a provider credential; refusing (D-021). Update the license server.'), { installNoFix: true });
    }
    resolved = body;
  } catch (err) {
    const failure = installFailure({
      status: err.installStatus,
      serverError: err.installServerError,
      cause: err.message,
    });
    console.error(`✗ License validation failed — ${failure.reason}`);
    console.error(`  Cause: ${failure.detail}`);
    console.error(`  ${failure.fix}`);
    if (!err.installNoFix) {
      console.error('  Re-run: grouter-copilot install --license <your-license-token>');
      console.error(`  (Your license is never printed in full: ${maskToken(opts.license)})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`✔ License valid (${maskToken(opts.license)}) — exchanging for gateway configuration (non-secret)`);

  const framework = detectFramework();
  console.log(`✔ Framework detected: ${framework.label}${frameworkNote(framework)}`);
  console.log('→ Writing project files…');

  const results = runInit({}, { silent: true });
  for (const r of results) console.log(`${r.skipped ? '· Skipped (already exists)' : '✔ Created'} ${r.rel}`);

  const envResult = writeEnv({
    gatewayUrl: resolved.gatewayUrl || new URL('/api/copilot/chat', licenseServerUrl).href,
    license: opts.license,
    licenseServerUrl,
    licensePublicKey: resolved.licensePublicKey,
  });
  if (envResult) {
    const verb = envResult.action === 'created' ? 'Created' : envResult.action === 'updated' ? 'Updated' : 'Unchanged (already configured)';
    console.log(`${envResult.action === 'unchanged' ? '·' : '✔'} ${verb} ${envResult.rel} (${envResult.keys.join(', ')})`);
  }
  console.log('');
  console.log('How it works: your app calls the Copilot backend gateway; the gRouter service');
  console.log('credential stays server-side (D-021) and is never stored in your project.');
  console.log('');
  printNextSteps(framework, { installed: true });
}

main();
