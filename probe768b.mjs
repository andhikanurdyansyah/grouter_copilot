import { chromium } from 'playwright';
const W = Number(process.argv[2] || 768), H = Number(process.argv[3] || 1024);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
page.on('crash', () => console.log('PAGE CRASH'));
page.on('console', m => { if (m.type()==='error'||m.type()==='warning') console.log('console', m.type(), m.text().slice(0,200)); });
const r = await page.goto('http://localhost:4601/', { waitUntil: 'load', timeout: 30000 });
console.log('status', r?.status(), `${W}x${H} (no --use-angle)`);
for (let i=0;i<5;i++){ await page.waitForTimeout(500); console.log('t', (i+1)*500, 'alive textLen try'); try { console.log(' textLen', await page.evaluate(() => document.body.innerText.length)); } catch(e){ console.log(' EVAL FAIL', String(e).slice(0,120)); break; } }
await browser.close(); console.log('OK');
