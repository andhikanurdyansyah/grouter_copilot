// E2E smoke: build a Copilot, run a chat, prove skill data reaches the model.
import { createCopilot } from '../src/index.js';

const configPath = new URL('../test-fixtures/copilot.config.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const copilot = await createCopilot({
  configPath,
  adapter: {
    complete: async ({ messages }) => {
      const dataLine = messages.find((m) => m.role === 'user').content;
      const hasTotal = /"total":\s*999/.test(dataLine);
      return { answer: hasTotal ? 'Total sales is 999 (grounded).' : 'NO DATA', usage: { inputTokens: 1, outputTokens: 2 } };
    },
  },
});

const out = await copilot.runtime.chat({ message: 'ringkas sales 7 hari', userId: 'u42', args: { period: '7d' } });
console.log(JSON.stringify(out, null, 2));
if (out.status !== 'complete') process.exit(1);
if (!out.answer.includes('grounded')) process.exit(2);
console.log('E2E OK: skill data reached the model, answer grounded, user scoped.');
