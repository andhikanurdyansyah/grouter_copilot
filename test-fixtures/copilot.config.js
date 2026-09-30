// Fixture config for e2e smoke test.
import salesSkill from './skills/sales.js';

export default {
  model: 'grouter-default',
  systemPrompt: 'Answer only from data provided.',
  skills: [salesSkill],
  limits: { maxRows: 500, maxContextBytes: 32000, maxTokens: 2000 },
};
