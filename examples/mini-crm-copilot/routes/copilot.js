// routes/copilot.js — Express router untuk produk gRouter Copilot asli di demo mini-CRM.
// POST /chat  -> gatewayChat (D-021: app memanggil Copilot backend gateway)
// GET  /health-> getCopilotHealth (host-local readiness)
//
// Dipasang di server.js dengan: app.use('/api/copilot', copilotRouter);
// (patch integrasi server.js ada di laporan — server.js milik agent CRM).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCopilot, gatewayChat, getCopilotHealth, toErrorEnvelope } from '../../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../copilot.config.js');
const DEFAULT_GATEWAY_URL = 'https://copilot.grouter.id/api/copilot/chat';

// Lazy singleton: dibuat saat request pertama agar boot server tidak tergantung config.
let copilotPromise = null;

function getCopilot() {
  if (!copilotPromise) {
    copilotPromise = createCopilot({ configPath: CONFIG_PATH }).catch((err) => {
      copilotPromise = null; // boleh retry pada request berikutnya
      throw err;
    });
  }
  return copilotPromise;
}

export function copilotRouter() {
  const router = express.Router();

  // POST /chat — body: { message (wajib, string), userId?, sessionId?, skillHint?, args? }
  router.post('/chat', async (req, res) => {
    const body = req.body ?? {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'Body JSON wajib berupa objek.' });
    }
    if (typeof body.message !== 'string' || body.message.trim() === '') {
      return res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'A non-empty "message" is required.' });
    }

    try {
      const copilot = await getCopilot();
      const reply = await gatewayChat({
        runtime: copilot.runtime,
        gatewayUrl: process.env.GROUTER_GATEWAY_URL || DEFAULT_GATEWAY_URL,
        // Sebarkan body apa adanya (message, userId, sessionId, skillHint, args, dst.).
        ...body,
      });
      res.status(reply?.status === 'error' ? 502 : 200).json(reply);
    } catch (err) {
      res.status(err?.status && Number.isInteger(err.status) ? err.status : 500).json(toErrorEnvelope(err));
    }
  });

  // GET /health — getCopilotHealth dengan token dari env GROUTER_LICENSE.
  router.get('/health', async (_req, res) => {
    try {
      const copilot = await getCopilot();
      const health = getCopilotHealth(copilot, process.env.GROUTER_LICENSE);
      res.status(health.status === 'ok' ? 200 : 503).json(health);
    } catch (err) {
      res.status(500).json({ status: 'unavailable', checks: { license: false, skills: false, provider: false }, error: toErrorEnvelope(err) });
    }
  });

  return router;
}

export default copilotRouter;
