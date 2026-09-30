#!/usr/bin/env node
/**
 * gRouter Copilot CLI — `npx @grouter/copilot init`.
 * Detects framework and scaffolds config, skills, route, widget, and .env.
 */

import { mkdirSync, writeFileSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

function runInit() {
  const framework = detectFramework();
  const results = [];

  console.log(`✔ Detected ${framework.label}`);
  if (framework.name === 'next') {
    console.log(framework.appRouter ? '  App Router layout' : '  Pages Router layout');
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

  const envResult = writeEnv();
  if (envResult) results.push(envResult);

  console.log('');
  for (const r of results) {
    console.log(`${r.skipped ? '· (exists)' : '✔ Created'} ${r.rel}`);
  }
  console.log('');
  console.log('Next:');
  console.log('  1. Set GROUTER_API_KEY in .env');
  console.log('  2. Mount <CopilotChat /> in your UI');
  console.log('  3. Edit skills/example.js to expose your data');
}

function writeEnv() {
  const rel = '.env';
  const full = path.join(cwd, rel);
  if (existsSync(full)) {
    const content = readFileSync(full, 'utf8');
    if (!content.includes('GROUTER_API_KEY')) {
      appendFileSync(full, '\nGROUTER_API_KEY=\n', 'utf8');
      return { rel, skipped: false };
    }
    return null;
  }
  writeFileSync(full, 'GROUTER_API_KEY=\n', 'utf8');
  return { rel, skipped: false };
}

function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === 'init') {
    runInit();
    return;
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log('Usage: grouter-copilot init');
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main();
