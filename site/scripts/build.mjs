import { execFileSync } from 'node:child_process';
import { readdir, mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'assets/utilities.input.css', '-o', 'assets/utilities.css', '--minify'], { stdio: 'inherit' });
const output = path.resolve('dist');
if (path.dirname(output) !== process.cwd() || path.basename(output) !== 'dist') throw new Error('Build output escaped the project');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of await readdir('.')) {
  if (/\.(html|svg|png|txt|xml)$/.test(file)) await copyFile(file, path.join('dist', file));
}
await cp('assets', 'dist/assets', { recursive: true, filter: p => !p.endsWith('.input.css') });
await mkdir('dist/.openai', { recursive: true });
const manifest = JSON.parse((await readFile('.openai/hosting.json', 'utf8')).replace(/^\uFEFF/, ''));
await writeFile('dist/.openai/hosting.json', JSON.stringify(manifest, null, 2));
console.log('Shift: static production build ready in dist/');
