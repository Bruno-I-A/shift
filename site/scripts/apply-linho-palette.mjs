/* Migração dos estilos existentes para os neutros da identidade Shift.
 * Executar a partir de site/. Não altera textos, URLs ou imagens de clientes. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const explicit=new Map([
  ['071522','191918'],['0a1428','191918'],['0e2335','252622'],
  ['f6f5f1','eae5dc'],['f4f1e8','eae5dc'],['f2a63d','eae5dc'],
  ['d4841a','d5d0c6'],['ffc93d','eae5dc'],['edbc75','eae5dc'],
  ['b56bff','eae5dc'],['8a4dcc','d5d0c6'],['10202c','191918']
]);
function channels(r,g,b){
  const hex=[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(explicit.has(hex))return explicit.get(hex).match(/../g).map(v=>parseInt(v,16));
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo;
  if(hi===0)return [r,g,b];
  if(delta<18){
    if(lo>225)return [234,229,220];
    return [r,g,b];
  }
  let hue=hi===r?((g-b)/delta)%6:hi===g?(b-r)/delta+2:(r-g)/delta+4;
  hue=(hue*60+360)%360;
  if((hue>=18&&hue<=70)||hue>=270&&hue<=330){
    if(hi>145)return [234,229,220];
    const v=Math.round((r*.2126+g*.7152+b*.0722));
    return [v+5,v+3,v];
  }
  if(hue>=170&&hue<270){
    let v=Math.round(r*.2126+g*.7152+b*.0722);
    if(hi<100)v=Math.max(22,Math.round(v*.8+6));
    return [v,Math.max(0,v-1),Math.max(0,v-4)];
  }
  return [r,g,b]; // feedbacks semânticos verdes e vermelhos
}
function recolor(source){
  return source.replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi,(whole,raw)=>{
    const h=raw.length<5?raw.split('').map(x=>x+x).join(''):raw;
    const rgb=channels(...[h.slice(0,2),h.slice(2,4),h.slice(4,6)].map(x=>parseInt(x,16)));
    return '#'+rgb.map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('')+h.slice(6);
  }).replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(\s*,\s*[.\d]+)?\s*\)/g,(whole,r,g,b,a)=>{
    return (a?'rgba(':'rgb(')+channels(+r,+g,+b).join(',')+(a||'')+')';
  });
}
const css=readdirSync('assets').filter(file=>file.endsWith('.css')&&!['utilities.css','brand-linho.css'].includes(file));
for(const file of css){const p=path.join('assets',file);writeFileSync(p,recolor(readFileSync(p,'utf8')));}
const pages=readdirSync('.').filter(file=>file.endsWith('.html'));
for(const file of pages){
  let html=readFileSync(file,'utf8');
  html=recolor(html);
  html=html.replace(/<img\b[^>]*src="assets\/brand\/shift-logo-navy-site\.svg"[^>]*>/g,img=>{
    const footer=img.includes('width="101"');
    return img.replace('assets/brand/shift-logo-navy-site.svg','assets/brand/shift-logo-linho.png')
      .replace(/width="\d+"/,'width="'+(footer?190:158)+'"').replace(/height="\d+"/,'height="'+(footer?50:42)+'"');
  });
  html=html.replace(/<script src="assets\/brand-logo\.js" defer><\/script>\s*/g,'');
  if(!html.includes('assets/brand-linho.css'))html=html.replace('</head>','<link rel="stylesheet" href="assets/brand-linho.css" />\n<link rel="apple-touch-icon" href="apple-touch-icon.png" />\n</head>');
  html=html.replace(/(<meta name="theme-color" content=")[^"]+/,'$1#191918');
  writeFileSync(file,html);
}
for(const file of readdirSync('assets/illustrations')){
  if(file.endsWith('.svg')){const p=path.join('assets/illustrations',file);writeFileSync(p,recolor(readFileSync(p,'utf8')));}
}
let config=readFileSync('tailwind.config.cjs','utf8');
config=config.replace('#071522','#191918').replace('#0E2335','#252622').replace('#F2A63D','#EAE5DC').replace('#D4841A','#D5D0C6').replace('#FFC93D','#EAE5DC').replace('#F6F5F1','#EAE5DC').replace('#B56BFF','#EAE5DC').replace('#8A4DCC','#D5D0C6');
writeFileSync('tailwind.config.cjs',config);
console.log(JSON.stringify({pages:pages.length,styles:css.length,theme:'Linho #EAE5DC / preto #191918'}));
