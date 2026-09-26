import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const pages = readdirSync('.').filter(file => file.endsWith('.html'));
const issues = [];
const marketingPages = ['index.html', 'processo.html', 'solucoes.html', 'segmentos.html', 'diagnostico.html', 'contato.html', 'sites.html'];
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

  if (marketingPages.includes(file)) {
    const header = source.match(/<header[\s\S]*?<\/header>/)?.[0] || '';
    const mobile = source.match(/<div id="mobile-menu"[\s\S]*?<\/div>/)?.[0] || '';
    if (header.includes('href="sites.html"') || mobile.includes('href="sites.html"')) {
      issues.push(`${file}: sites.html must not appear in the primary navigation`);
    }
    for (const required of ['processo.html', 'solucoes.html', 'segmentos.html', 'diagnostico.html', 'contato.html']) {
      if (!header.includes(`href="${required}"`) || !mobile.includes(`href="${required}"`)) {
        issues.push(`${file}: primary navigation missing ${required}`);
      }
    }
  }
}


const publishedText = [
  ...pages.map(file => [file, readFileSync(file, 'utf8')]),
  ['assets/site.js', readFileSync('assets/site.js', 'utf8')],
  ['assets/cinema.js', readFileSync('assets/cinema.js', 'utf8')],
  ['llms.txt', readFileSync('llms.txt', 'utf8')],
  ['llms-full.txt', readFileSync('llms-full.txt', 'utf8')]
];
const forbidden = [/log pose/i, /tesouro/i, /mar aberto/i, /tripula[cç][aã]o/i, /ganhar o mundo/i, /feito em mar aberto/i];
for (const [file, source] of publishedText) {
  for (const phrase of forbidden) {
    if (phrase.test(source)) issues.push(`${file}: forbidden legacy metaphor ${phrase}`);
  }
}

if (!existsSync('segmentos.html')) issues.push('segmentos.html: missing route');
if (!readFileSync('sitemap.xml', 'utf8').includes('/segmentos.html')) issues.push('sitemap.xml: missing segmentos.html');

const home = readFileSync('index.html', 'utf8');
const homeMeta = {
  title: '<title>Shift Systems · Transformamos sua empresa em AI-first</title>',
  description: 'Empresas que colocam IA na operação estão saindo na frente. A Shift transforma a sua em AI-first: IA que gerencia processos, organiza equipes e apoia decisões, com segurança e a sua equipe no controle. Diagnóstico gratuito.',
  socialTitle: 'Shift Systems · Sua empresa AI-first, agora'
};
if (!home.includes(homeMeta.title)) issues.push('index.html: required title is missing');
if ((home.match(new RegExp(homeMeta.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length < 3) issues.push('index.html: description must match meta, OG and Twitter');
if ((home.match(new RegExp(homeMeta.socialTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length < 2) issues.push('index.html: social title must match OG and Twitter');
if (!/TODO Bruno: preencher com case real e remover hidden\. Nunca publicar dados fictícios\.[\s\S]*<section\b[^>]*\bhidden\b[^>]*>/.test(home)) {
  issues.push('index.html: hidden proof section or required TODO is missing');
}

const diagnostic = readFileSync('diagnostico.html', 'utf8');
for (const key of ['segmento', 'controle', 'dor', 'ia', 'equipe', 'prazo']) {
  if (!diagnostic.includes(`data-q="${key}"`)) issues.push(`diagnostico.html: missing question key ${key}`);
}
if (!/(?:const|var) CRM_ENDPOINT\s*=\s*['"]['"]/.test(diagnostic)) issues.push('diagnostico.html: CRM_ENDPOINT must default to empty');
if (!diagnostic.includes('type="checkbox"') || /type="checkbox"[^>]*\bchecked\b/.test(diagnostic)) issues.push('diagnostico.html: consent checkbox missing or checked by default');
if (/estimativa de horas|horas por semana|treasure-/i.test(diagnostic)) issues.push('diagnostico.html: unsupported time estimate remains');

const privacy = readFileSync('privacidade.html', 'utf8');
if (!/consentimento/i.test(privacy) || !/exclus[aã]o/i.test(privacy)) issues.push('privacidade.html: consent or deletion disclosure missing');
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${pages.length} routes, local links, anchors, assets, headings and structured metadata.`);
