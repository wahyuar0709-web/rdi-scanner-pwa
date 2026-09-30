/* L1 F-06f (2026-09-25): UI-11 heading order + UI-12 touch target 44px
 * + UI-13 deep link hash + UI-14 prefers-color-scheme.
 * UI-11: heading pertama dokumen harus <h1> (login "Masuk" naik h2→h1; selector
 *        .login-card h2 → h1 agar styling identik).
 * UI-12: .sheet-close/.ilc3-fab visual 30px dipertahankan; area sentuh diperbesar
 *        ke 44px via ::after (position absolute di dalam element).
 * UI-13: switchTab menulis location.hash (replaceState) + listener hashchange +
 *        apply hash setelah auth/boot (deep linking).
 * UI-14: first-visit ikut prefers-color-scheme; pilihan user (rdi_theme) menang. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// --- UI-11 heading order ---
const iH1 = src.indexOf('<h1');
const iH2 = src.indexOf('<h2');
t('UI-11: heading pertama dokumen adalah <h1> (login Masuk)', iH1 >= 0 && iH1 < iH2,
  'h1@' + iH1 + ' h2@' + iH2);
t('UI-11: <h1>Masuk</h1> ada (bukan h2)', /<h1>Masuk<\/h1>/.test(src));
t('UI-11: <h2>Masuk</h2> lama sudah tak ada', !/<h2>Masuk<\/h2>/.test(src));
t('UI-11: selector styling pindah ke .login-card h1', /\.login-card h1\{[^}]*font-size:19px/.test(src));
t('UI-11: selector .login-card h2 lama tak tertinggal', !/\.login-card h2\{/.test(src));

// --- UI-12 touch target (visual 30px tetap, hit area 44px via ::after) ---
function rule(sel) {
  const base = sel.endsWith('{') ? sel.slice(0, -1) : sel;
  const m = src.match(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}'));
  return m ? m[0] : '';
}
const scRule = rule('.sheet-close{');
const fabRule = rule('.ilc3-fab{');
t('UI-12: .sheet-close visual 30px dipertahankan', /\.sheet-close\{[^}]*width:30px;height:30px/.test(scRule));
t('UI-12: .sheet-close punya position:relative (anchor ::after)', /position:relative/.test(scRule), scRule.slice(0, 160));
const scAfter = rule('.sheet-close::after{');
t('UI-12: .sheet-close::after hit area 44px absolute',
  scAfter !== '' && /position:absolute/.test(scAfter) && /width:44px/.test(scAfter) && /height:44px/.test(scAfter), scAfter);
const fabAfter = rule('.ilc3-fab::after{');
t('UI-12: .ilc3-fab::after hit area 44px absolute',
  fabAfter !== '' && /position:absolute/.test(fabAfter) && /width:44px/.test(fabAfter) && /height:44px/.test(fabAfter), fabAfter);
t('UI-12: .ilc3-fab visual 30px dipertahankan', /\.ilc3-fab\{[^}]*width:30px;height:30px/.test(fabRule));

// --- UI-13 deep link hash ---
const swIdx = src.indexOf('function switchTab');
const swBody = swIdx >= 0 ? src.slice(swIdx, swIdx + 400) : '';
t('UI-13: switchTab menulis hash via history.replaceState', /history\.replaceState/.test(swBody), swBody.slice(0, 160));
t('UI-13: daftar nama tab valid untuk hash (_tabHashNames)',
  /_tabHashNames\s*=\s*\[[^\]]*'scanner'[^\]]*'master'[^\]]*'aset'[^\]]*\]/.test(src.replace(/\r?\n/g, '')));
t('UI-13: listener hashchange -> switchTab', /addEventListener\('hashchange'[^)]*\)[\s\S]{0,200}switchTab/.test(src));
t('UI-13: apply hash setelah boot (hasValidSession guard)', /hasValidSession\(\)[^;]{0,80}_applyHashTab/.test(src.replace(/\r?\n/g, '')));
t('UI-13: apply hash setelah login sukses', /startAppAfterAuth\(\)\.then\([\s\S]{0,60}_applyHashTab/.test(src));

// --- UI-14 tema dikunci terang (perubahan 2026-09-30) ---
// SEBELUMNYA suite ini menjamin bahwa aplikasi menghormati prefers-color-scheme
// dan pilihan tema user lewat localStorage. Keduanya DIHAPUS atas permintaan
// user: mode gelap dihapus, topbar di HP terlalu padat. Assertion lama
// diganti assertion yang mengunci kebalikan, supaya regresi ke mode gelap
// (atau returnnya tombol tema) tetap terdeteksi.
const FLAT = src.replace(/\r?\n/g, '');
t('UI-14: applyTheme memaksa body .light',
  /function applyTheme\(\)\{[\s\S]{0,600}?classList\.add\('light'\)/.test(src));
t('UI-14: preferensi rdi_theme lama dibersihkan, bukan dipatuhi',
  /localStorage\.removeItem\('rdi_theme'\)/.test(FLAT));
t('UI-14: tidak ada _isDark / _themeSaved (mode gelap tidak mungkin aktif)',
  !/_isDark|_themeSaved/.test(src));
t('UI-14: toggleTheme tidak ada lagi',
  !/function toggleTheme/.test(src) && !/window\.toggleTheme/.test(src));
t('UI-14: tidak ada tombol/handler tema di markup',
  !/onclick="toggleTheme/.test(src) && !/id="btn-theme-toggle"/.test(src) && !/id="theme-icon"/.test(src));
t('UI-14: CSS .theme-toggle-btn tidak tertinggal',
  !/\.theme-toggle-btn\{/.test(src) && !/#btn-theme-toggle/.test(src));
t('UI-14: body punya class light di markup (aman sebelum JS jalan)',
  /<body class="light">/.test(src));

console.log('---- ui11_f06f_bundle: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
