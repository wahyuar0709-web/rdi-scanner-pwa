// F-06a — UI-01 modal focus management + UI-02 sbar aria-live (L1 static) — RED first
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lines = src.split(/\r?\n/);

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + ' | ' + (detail !== undefined ? detail : true)); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail !== undefined ? detail : false)); }
}

// ===== UI-01: modal focus helpers =====
t('UI-01 modalFocusOpen defined', /function\s+modalFocusOpen\s*\(/.test(src), true);
t('UI-01 modalFocusClose defined', /function\s+modalFocusClose\s*\(/.test(src), true);
t('UI-01 focus stack state', /_modalFocusStack/.test(src), true);
t('UI-01 captures activeElement', /document\.activeElement/.test(src), true);
t('UI-01 restores focus on close', /modalFocusClose\(/.test(src) && /\.focus\(\)/.test(src), true);

function fnBody(name) {
  const m = src.match(new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) return null;
  const start = m.index + m[0].length;
  return src.slice(start, start + 1200);
}

const pairs = [
  ['openExportQRModal', 'closeExportQRModal'],
  ['openExportExcelModal', 'closeExportExcelModal'],
  ['showUserModal', 'hideUserModal'],
  ['showConfig', 'hideConfig'],
];
for (const [open, close] of pairs) {
  const ob = fnBody(open), cb = fnBody(close);
  t('UI-01 ' + open + ' body found', !!ob, !!ob);
  t('UI-01 ' + open + ' calls modalFocusOpen', !!ob && /modalFocusOpen\(/.test(ob), true);
  t('UI-01 ' + close + ' body found', !!cb, !!cb);
  t('UI-01 ' + close + ' calls modalFocusClose', !!cb && /modalFocusClose\(/.test(cb), true);
}

// ===== UI-02: every .sbar announced =====
const sbarLines = [];
lines.forEach((l, i) => { if (/class="sbar/.test(l)) sbarLines.push({ n: i + 1, l }); });
t('UI-02 sbar count >= 17', sbarLines.length >= 17, 'count=' + sbarLines.length);
let mute = [];
for (const s of sbarLines) {
  if (!/aria-live=|role="status"|role="alert"/.test(s.l)) mute.push('L' + s.n);
}
t('UI-02 all sbar have aria-live/role', mute.length === 0, mute.length ? mute.join(',') : 'all-announced');

const errSbars = sbarLines.filter(s => /s-err/.test(s.l));
t('UI-02 err sbar found', errSbars.length >= 4, 'count=' + errSbars.length);
const errNoAlert = errSbars.filter(s => !/role="alert"/.test(s.l)).map(s => 'L' + s.n);
t('UI-02 s-err uses role=alert', errNoAlert.length === 0, errNoAlert.length ? errNoAlert.join(',') : 'all-alert');

// summary
console.log('---');
console.log((fail === 0 ? 'PASS' : 'FAIL') + ' | ui06a_focus_sbar | pass=' + pass + ' fail=' + fail);
process.exit(fail === 0 ? 0 : 1);
