import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const pages = readdirSync('.').filter(file => file.endsWith('.html'));
const issues = [];
for (const file of pages) {
  const source = readFileSync(file, 'utf8');
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  if (ids.length !== new Set(ids).size) issues.push(`${file}: duplicate IDs`);
  if ((source.match(/<h1\b/g) || []).length !== 1) issues.push(`${file}: expected one h1`);
  if (source.includes('cdn.tailwindcss.com')) issues.push(`${file}: runtime CSS compiler present`);
  for (const match of source.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const url = match[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(url)) continue;
    const [target, hash] = url.split('#');
    const targetFile = target || file;
    if (!existsSync(targetFile)) { issues.push(`${file}: missing ${targetFile}`); continue; }
    if (hash && targetFile.endsWith('.html') && !readFileSync(targetFile,'utf8').includes(`id="${hash}"`)) issues.push(`${file}: missing anchor ${url}`);
  }
  for (const match of source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch { issues.push(`${file}: invalid structured metadata`); }
  }
}
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${pages.length} routes, local links, anchors, assets, headings and structured metadata.`);
