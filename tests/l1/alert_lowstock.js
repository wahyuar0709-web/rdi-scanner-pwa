// F-04 — Alert low stock (min_stock) — L1 pure/static regression
// Verifies existing alert system: loadAlert, updateAlertBadge, renderDashAlertWidget,
// section-alert UI, saveMinStock, HABIS/RENDAH status, minStockMap.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + ' | ' + (detail !== undefined ? detail : true)); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (detail !== undefined ? detail : false)); }
}

// --- UI structure ---
t('F-04 section-alert exists', src.includes('id="section-alert"'), src.includes('id="section-alert"'));
t('F-04 alert-tbody exists', src.includes('id="alert-tbody"'), src.includes('id="alert-tbody"'));
t('F-04 minstock-tbody exists', src.includes('id="minstock-tbody"'), src.includes('id="minstock-tbody"'));
t('F-04 badge-alert exists', src.includes('id="badge-alert"'), src.includes('id="badge-alert"'));
t('F-04 dash-alert KPI exists', src.includes('id="dash-alert"'), src.includes('id="dash-alert"'));
t('F-04 dash-alert-widget exists', src.includes('id="dash-alert-widget"'), src.includes('id="dash-alert-widget"'));
t('F-04 more-alert-label exists', src.includes('id="more-alert-label"'), src.includes('id="more-alert-label"'));
t('F-04 quick action Alert button', /switchTab\('alert'\)/.test(src), true);

// --- Functions defined ---
t('F-04 loadAlert defined', /function\s+loadAlert\s*\(/.test(src), true);
t('F-04 updateAlertBadge defined', /function\s+updateAlertBadge\s*\(/.test(src), true);
t('F-04 renderDashAlertWidget defined', /function\s+renderDashAlertWidget\s*\(/.test(src), true);
t('F-04 saveMinStock defined', /function\s+saveMinStock\s*\(/.test(src), true);
t('F-04 syncMinStockMap defined', /function\s+syncMinStockMap\s*\(/.test(src), true);
t('F-04 minStockMap declared', /var\s+minStockMap\s*=\s*\{\}/.test(src), true);
t('F-04 switchTab routes alert', /name==='alert'\)\s*loadAlert\(\)/.test(src), true);

// --- Core logic: alert filter predicate (extract loadAlert body snippet) ---
const loadAlertMatch = src.match(/function\s+loadAlert\s*\(\)\s*\{([\s\S]{0,2500})/);
t('F-04 loadAlert body found', !!loadAlertMatch, !!loadAlertMatch);
if (loadAlertMatch) {
  const body = loadAlertMatch[1];
  t('F-04 loadAlert filters min>0 && qty<=min', /min\s*>\s*0\s*&&\s*parseInt\(r\.qty\|\|0\)\s*<=\s*min/.test(body), true);
  t('F-04 loadAlert uses minStockMap', /minStockMap\[r\.id\]/.test(body), true);
  t('F-04 loadAlert HABIS badge', /HABIS/.test(body), true);
  t('F-04 loadAlert RENDAH badge', /RENDAH/.test(body), true);
  t('F-04 loadAlert kritis=saldo===0', /kritis\s*=\s*saldo\s*===\s*0/.test(body), true);
  t('F-04 loadAlert Aksi + Masuk', /\+\s*Masuk/.test(body), true);
  t('F-04 loadAlert empty state aman', /Semua stok di atas minimum/.test(body), true);
  t('F-04 loadAlert empty allRows CTA', /Load data Master Item terlebih dahulu/.test(body), true);
}

// --- updateAlertBadge ---
const badgeMatch = src.match(/function\s+updateAlertBadge\s*\(\)\s*\{([\s\S]{0,1200})/);
t('F-04 updateAlertBadge body found', !!badgeMatch, !!badgeMatch);
if (badgeMatch) {
  const body = badgeMatch[1];
  t('F-04 badge counts min>0 && qty<=min', /min\s*>\s*0\s*&&\s*parseInt\(r\.qty\|\|0\)\s*<=\s*min/.test(body), true);
  t('F-04 badge caps at 9+', /9\+/.test(body), true);
  t('F-04 badge toggles .show', /classList\.(add|remove)\('show'\)/.test(body), true);
  t('F-04 badge updates dash-alert', /dash-alert/.test(body), true);
  t('F-04 badge updates more-alert-label', /more-alert-label/.test(body), true);
}

// --- renderDashAlertWidget ---
const dashMatch = src.match(/function\s+renderDashAlertWidget\s*\(\)\s*\{([\s\S]{0,1500})/);
t('F-04 renderDashAlertWidget body found', !!dashMatch, !!dashMatch);
if (dashMatch) {
  const body = dashMatch[1];
  t('F-04 dash widget filters critical', /m\s*>\s*0\s*&&\s*parseInt\(r\.qty\|\|0\)\s*<=\s*m/.test(body), true);
  t('F-04 dash widget sorts by qty asc', /sort\(function\(a,b\)\{\s*return\s*parseInt\(a\.qty\|\|0\)-parseInt\(b\.qty\|\|0\)/.test(body), true);
  t('F-04 dash widget slices top 5', /\.slice\(0,\s*5\)/.test(body), true);
  t('F-04 dash widget empty aman', /Semua stok aman/.test(body), true);
  t('F-04 dash widget clickable openItemDetail', /openItemDetail\(/.test(body), true);
}

// --- saveMinStock ---
const saveMatch = src.match(/function\s+saveMinStock\s*\([^)]*\)\s*\{([\s\S]{0,900})/);
t('F-04 saveMinStock body found', !!saveMatch, !!saveMatch);
if (saveMatch) {
  const body = saveMatch[1];
  t('F-04 saveMinStock clamps neg to 0', /val\s*<\s*0\s*&&\s*\(val\s*=\s*0\)|if\(val<0\)val=0/.test(body), true);
  t('F-04 saveMinStock updates minStockMap', /minStockMap\[id\]\s*=\s*val/.test(body), true);
  t('F-04 saveMinStock updates r.minStock', /r\.minStock\s*=\s*val/.test(body), true);
  t('F-04 saveMinStock gasPost updateItem', /action:\s*'updateItem'/.test(body), true);
  t('F-04 saveMinStock rollback on error', /minStockMap\[id\]\s*=\s*prev/.test(body), true);
  t('F-04 saveMinStock refreshes badge', /updateAlertBadge\(\)/.test(body), true);
}

// --- switchTab wiring ---
const switchMatch = src.match(/if\(name==='alert'\)\s*loadAlert\(\)/);
t('F-04 switchTab alert loads', !!switchMatch, !!switchMatch);

// --- Simulation: alert predicate ---
function alertFilter(rows, minMap) {
  return rows.filter(function (r) {
    var min = parseInt(minMap[r.id] || 0);
    return min > 0 && parseInt(r.qty || 0) <= min;
  });
}
const simRows = [
  { id: 'A1', qty: 5, nama: 'Item A' },   // min 10 → alert
  { id: 'A2', qty: 20, nama: 'Item B' },  // min 10 → ok
  { id: 'A3', qty: 0, nama: 'Item C' },   // min 5 → alert (HABIS)
  { id: 'A4', qty: 3, nama: 'Item D' },   // min 0 → no alert (min not set)
  { id: 'A5', qty: 10, nama: 'Item E' },  // min 10 → alert (qty<=min)
];
const simMin = { A1: 10, A2: 10, A3: 5, A4: 0, A5: 10 };
const alerted = alertFilter(simRows, simMin);
t('sim: alerts count = 3 (A1,A3,A5)', alerted.length === 3, 'n=' + alerted.length);
t('sim: A1 alerted (5<=10)', alerted.some(r => r.id === 'A1'), true);
t('sim: A3 alerted HABIS (0<=5)', alerted.some(r => r.id === 'A3'), true);
t('sim: A2 NOT alerted (20>10)', !alerted.some(r => r.id === 'A2'), true);
t('sim: A4 NOT alerted (min=0 disabled)', !alerted.some(r => r.id === 'A4'), true);
t('sim: A5 alerted boundary (10<=10)', alerted.some(r => r.id === 'A5'), true);
t('sim: min=0 never alerts', alertFilter([{ id: 'X', qty: 0 }], { X: 0 }).length === 0, true);

// --- HABIS vs RENDAH classification ---
function classify(saldo) { return saldo === 0 ? 'HABIS' : 'RENDAH'; }
t('sim: saldo 0 => HABIS', classify(0) === 'HABIS', true);
t('sim: saldo 3 => RENDAH', classify(3) === 'RENDAH', true);

console.log('=== F-04 ALERT LOW STOCK: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
