const fs = require('fs');
const ROOT = process.env.RDI_TEST_ROOT || require('path').resolve(__dirname, '../..');
const fsx = require('fs');
const utilPath = require('path').join(ROOT, 'js/util.js');
const util = fsx.existsSync(utilPath) ? fsx.readFileSync(utilPath, 'utf8') : '';
const h = fs.readFileSync(require('path').join(ROOT, 'index.html'), 'utf8') + '\n' + util;
function ext(src, name) {
  const d = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = src.match(d);
  if (!m) return null;
  const i = m.index;
  const b = src.indexOf('{', i);
  let dep = 0, st = false, end = -1;
  for (let j = b; j < src.length; j++) {
    if (src[j] === '{') { dep++; st = true; }
    else if (src[j] === '}') { dep--; if (st && dep === 0) { end = j; break; } }
  }
  return src.slice(i, end + 1);
}
const a = ext(h, 'xe');
const b = ext(h, 'ex');
const n = s => s.replace(/\s+/g, '');
console.log('XE:', n(a));
console.log('EX:', n(b));
console.log('EQ:', n(a) === n(b));
console.log('more section id:', /id="section-more"/.test(h));
console.log('more drawer:', /more-drawer/.test(h));
