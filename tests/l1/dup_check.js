const fs = require('fs');
const html = fs.readFileSync('c:/projec/rdi-scanner-pwa/index.html', 'utf8');
const lines = html.split('\n');
const pats = [
  'function attempt(',
  'function ex(',
  'function onStart(',
  'function onMove(',
  'function onEnd(',
  'function showModal(',
  'function getAsetEligibleUnits(',
  'function recalculateAllSaldo(',
  'function gasGet(',
  'function gasPost(',
  'function xe(',
  'function xeJs(',
  'function hasValidSession(',
  'function saveConfig(',
  'function switchTab(',
  'function showStatus(',
  'function forceReLogin(',
  'function genRequestId(',
  'function submitTransaksi(',
];
for (const p of pats) {
  const hits = [];
  lines.forEach((l, i) => { if (l.includes(p)) hits.push(i + 1); });
  console.log(p + ' -> ' + hits.join(','));
}

// Investigate attempt dups: show context for each
console.log('\n=== attempt occurrences ===');
lines.forEach((l, i) => {
  if (l.includes('function attempt(') || /function attempt\b/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 200));
  }
});
console.log('\n=== showModal occurrences ===');
lines.forEach((l, i) => {
  if (/function showModal\s*\(/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 200));
  }
});
console.log('\n=== onStart/onMove/onEnd ===');
lines.forEach((l, i) => {
  if (/function on(Start|Move|End)\s*\(/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 160));
  }
});
console.log('\n=== ex( definitions ===');
lines.forEach((l, i) => {
  if (/function ex\s*\(/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 200));
  }
});
