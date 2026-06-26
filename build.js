/* Precompile landing/*.jsx -> landing/*.js (so the site needs no in-browser Babel).
 * Run after editing any .jsx:
 *     npm i @babel/standalone && node build.js
 */
const B = require('@babel/standalone');
const fs = require('fs');

['components', 'sections', 'app'].forEach((n) => {
  const src = fs.readFileSync(`landing/${n}.jsx`, 'utf8');
  const code = B.transform(src, { presets: [['react', { runtime: 'classic' }]], filename: `${n}.jsx` }).code;
  const out = `/* AUTO-GENERATED from ${n}.jsx — edit the .jsx then run "node build.js" */\n(function () {\n${code}\n})();\n`;
  fs.writeFileSync(`landing/${n}.js`, out);
  console.log('built landing/' + n + '.js');
});
