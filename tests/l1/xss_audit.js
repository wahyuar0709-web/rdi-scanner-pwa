const fs = require('fs');
const html = fs.readFileSync('c:/projec/rdi-scanner-pwa/index.html','utf8');
const lines = html.split('\n');
console.log('=== INNERHTML / INSERTADJACENT / OUTERHTML / WRITE SINKS ===');
let count = 0;
lines.forEach((l,i)=>{
  if(/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\(|document\.write\(/.test(l)){
    count++;
    console.log('L'+(i+1)+': '+l.trim().slice(0,240));
  }
});
console.log('Total sinks:', count);

console.log('\n=== UNESCAPED DYNAMIC HTML (heuristic: string concat into tags near L) ===');
// find innerHTML = ... + var without xe(
lines.forEach((l,i)=>{
  if(/\.innerHTML\s*=/.test(l)){
    // heuristic: has + varname or +res. or +r. without xe( nearby on same assignment
    if(/\.innerHTML\s*=[^;]*\+\s*(?:res\.|r\.|item\.|row\.|x\.|d\.|data\.)/.test(l) && !/xe\(/.test(l.split('.innerHTML')[1]||'')){
      console.log('SUSPECT L'+(i+1)+': '+l.trim().slice(0,280));
    }
  }
});

console.log('\n=== setInterval L2448 context ===');
console.log(lines.slice(2440,2470).map((l,i)=>(2441+i)+': '+l).join('\n'));

console.log('\n=== showModal occurrences ===');
lines.forEach((l,i)=>{ if(/function\s+showModal|showModal\s*=/.test(l)) console.log('L'+(i+1)+': '+l.trim().slice(0,200)); });

console.log('\n=== getAsetEligibleUnits definition in Code.gs ===');
const gs = fs.readFileSync('c:/projec/rdi-scanner-pwa/Code.gs','utf8');
console.log((/function\s+getAsetEligibleUnits/.test(gs)?'FOUND function getAsetEligibleUnits':'MISSING function getAsetEligibleUnits'));
const m = gs.match(/function\s+getAsetEligibleUnits[\s\S]{0,400}/);
if(m) console.log(m[0].slice(0,400));
// check action handler
console.log((/action === 'getAsetEligibleUnits'|getAsetEligibleUnits:/.test(gs)?'handler exists':'no direct handler string'));
// find where READ_ACTIONS routes getAsetEligibleUnits
const route = gs.match(/getAsetEligibleUnits[^\n]{0,200}/g);
console.log(route && route.slice(0,8));

console.log('\n=== sessionStorage vs localStorage for token ===');
lines.forEach((l,i)=>{ if(/rdi_viewer_token|rdi_editor_key|sessionStorage|localStorage/.test(l) && /secure|writeSecure|readSecure|VIEWER|EDITOR|clearItem|setItem|getItem|removeItem/.test(l)) console.log('L'+(i+1)+': '+l.trim().slice(0,220)); });

console.log('\n=== Default GAS URL / secrets ===');
lines.forEach((l,i)=>{ if(/AKfycb|EDITOR_KEY\s*=|DEFAULT_GAS/.test(l)) console.log('L'+(i+1)+': '+l.trim().slice(0,240)); });
const gs2 = gs.split('\n');
gs2.forEach((l,i)=>{ if(/EDITOR_KEY\s*=|SCRIPT_PROP|PropertiesService/.test(l) && /DEFAULT|hardcode|'sk-/.test(l)) console.log('GS L'+(i+1)+': '+l.trim().slice(0,200)); });
