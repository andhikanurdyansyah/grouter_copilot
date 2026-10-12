// Host-local Copilot health. Mount this GET handler at /api/copilot/health.
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
