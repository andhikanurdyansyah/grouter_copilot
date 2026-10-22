// Copy the dependency-free embed widget into dist-widget/ for npm packaging.
import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'widget', 'embed');
const out = path.join(root, 'dist-widget');
mkdirSync(out, { recursive: true });
copyFileSync(path.join(src, 'copilot.js'), path.join(out, 'copilot.js'));
copyFileSync(path.join(src, 'copilot.css'), path.join(out, 'copilot.css'));
console.log('dist-widget rebuilt:', out);
