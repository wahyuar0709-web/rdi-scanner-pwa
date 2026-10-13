/* L1 handler_reachability (2026-10-13) — menegakkan kelas BUG-01 dengan benar.
 *
 * KENAPA FILE INI ADA (celah gate yang nyata):
 *   tests/l1/handler_coverage.js -> isGlobalDef() hanya grep `function NAME(` di source
 *   gabungan. Deklarasi DI DALAM IIFE juga cocok, padahal tidak terjangkau dari inline
 *   handler (inline handler resolve ke global object). Akibatnya DBG-01
 *   (togglePwVisibility dideklarasikan di IIFE tapi dipanggil `onclick="togglePwVisibility()"`)
 *   Lolos gate yang justru dibuat untuk mencegahnya.
 *
 * ATURAN YANG BENAR:
 *   Sebuah inline handler hanya bisa memanggil nama yang benar-benar ada di global object.
 *   Nama global bisa datang dari 2 sumber sah:
 *     (a) assignment ke objek global di mana pun:  window.X = / globalThis.X = / self.X = / root.X =
 *     (b) deklarasi TOP-LEVEL di classic script terpisah (js/*.js, dimuat tanpa type="module")
 *         -> function X( / var X / let X / const X  di kolom 0
 *   Deklarasi di dalam IIFE index.html TIDAK dihitung (tersembunyi).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const JS_FILES = ['js/util.js', 'js/cetak.js', 'js/outbox.js', 'js/format.js', 'js/importexcel.js'];
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const jsAll = JS_FILES.map(f => ({ f, s: fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '' }));

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function esc(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---------- 1. kumpulkan inline handler dari index.html ----------
const ATTRS = 'on(?:click|input|change|keydown|blur|focus|submit|dblclick|auxclick|mousedown|mouseup|touchstart|touchend|mouseover|scroll|contextmenu)';
const handlers = [];
const reH = new RegExp('\\s(' + ATTRS + ')="([^"]*)"', 'g');
let m;
while ((m = reH.exec(idx))) {
  const line = idx.slice(0, m.index).split(/\r?\n/).length;
  handlers.push({ attr: m[1], code: m[2], line });
}
t('reach: >=280 inline handler terdeteksi (baseline 286)', handlers.length >= 280, 'dapat ' + handlers.length);

// ---------- 2. kumpulkan nama global yang SAH ----------
const globalNames = new Set();

// (a) assignment ke objek global — sah di mana pun, walau di dalam IIFE
const reAssign = /(?:^|[^\w.$])(?:window|globalThis|self|root|global)\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g;
[idx].concat(jsAll.map(x => x.s)).forEach(src => {
  let mm; const r = new RegExp(reAssign.source, 'g');
  while ((mm = r.exec(src))) globalNames.add(mm[1]);
});

// (b) deklarasi top-level di classic script js/*.js
jsAll.forEach(({ f, s }) => {
  s.split(/\r?\n/).forEach(line => {
    let d = line.match(new RegExp('^function\\s+([A-Za-z_$][\\w$]*)\\s*\\('));
    if (d) { globalNames.add(d[1]); return; }
    d = line.match(new RegExp('^(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*[=;]'));
    if (d) globalNames.add(d[1]);
  });
});

// ---------- 3. ekstrak callee dari setiap handler, buang method receiver ----------
const SKIP = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await', 'void', 'delete', 'in', 'of', 'do', 'else', 'try', 'throw', 'case', 'var', 'let', 'const',
  'event', 'e', 'ev', 'evt', 'this', 'window', 'document', 'console', 'globalThis', 'Math', 'JSON', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object', 'RegExp', 'Error', 'Promise', 'Boolean',
  'alert', 'confirm', 'prompt', 'fetch', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'encodeURIComponent', 'decodeURIComponent',
  'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'getComputedStyle', 'matchMedia', 'btoa', 'atob', 'performance', 'crypto', 'isFinite', 'encodeURI', 'decodeURI'
]);

const usage = new Map();   // nama -> {count, firstLine, firstTag-ish}
let handlerTanpaApapun = 0;
const handlerTanpaCallee = [];
handlers.forEach(h => {
  const methodCalls = (h.code.match(/\.\s*[A-Za-z_$][\w$]*\s*\(/g) || []).length;
  // buang method receiver (X.foo(...)) sebelum ambil nama polos
  const bare = h.code.replace(/\.\s*[A-Za-z_$][\w$]*\s*\(/g, '.(');
  const reC = /(^|[^\w.$])([A-Za-z_$][\w$]*)\s*\(/g;
  let c, found = 0;
  while ((c = reC.exec(bare))) {
    const n = c[2];
    if (SKIP.has(n)) continue;
    found++;
    if (!usage.has(n)) usage.set(n, { count: 0, line: h.line, attr: h.attr, code: h.code });
    usage.get(n).count++;
  }
  // handler yang HANYA memanggil method (mis. `this.blur()`, `e.preventDefault()`) valid —
  // tidak perlu punya callee global. Yang mencurigakan hanya yang benar-benar kosong.
  if (!found && !methodCalls) { handlerTanpaApapun++; handlerTanpaCallee.push('L' + h.line + ' ' + h.attr + '="' + h.code.replace(/\s+/g, ' ').slice(0, 50) + '"'); }
});

// ---------- 4. verdict ----------
const dead = [];
usage.forEach((info, name) => { if (!globalNames.has(name)) dead.push({ name, info }); });
dead.sort((a, b) => a.info.line - b.info.line);

t('reach: tidak ada inline handler yang kosong total', handlerTanpaApapun === 0,
  handlerTanpaApapun + ' handler tanpa panggilan: ' + handlerTanpaCallee.join(' | '));
t('reach: >=120 unique callee terinventarisasi', usage.size >= 120, 'dapat ' + usage.size + ' nama unik dari ' + handlers.length + ' handler');
t('reach: TIDAK ADA inline handler yang memanggil nama non-global', dead.length === 0,
  dead.length === 0
    ? usage.size + ' callee semua terjangkau secara global'
    : dead.map(d => d.name + ' (x' + d.info.count + ' di L' + d.info.line + ' "' + d.info.attr + '="' + d.info.code.replace(/\s+/g, ' ').slice(0, 60) + '"').join(' ;; '));

// ---------- 5. guard anti-vacuum: suite ini harus bisa mendeteksi injeksi ----------
const fake = 'function deadProbe(){}\nonclick="deadProbe()"';
const fakeSrc = 'window.__fake="<button onclick=\\"deadProbe()\\">"';
const fakeIdx = fake + '\n' + fakeSrc;
const reH2 = new RegExp('\\s(onclick)="([^"]*)"', 'g');
let hit = null, m2;
while ((m2 = reH2.exec(fakeIdx))) hit = m2[2];
t('reach: guard anti-vacuum — pola injeksi handler terdeteksi parser', hit === 'deadProbe()', 'tangkap: ' + JSON.stringify(hit));
t('reach: guard anti-vacuum — nama non-global TIDAK lolos', hit !== null && !globalNames.has('deadProbe'), 'deadProbe global? ' + globalNames.has('deadProbe'));

console.log('---- handler_reachability: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);