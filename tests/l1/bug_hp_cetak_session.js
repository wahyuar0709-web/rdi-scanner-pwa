// BUG FIX CYCLE 2026-09-26 (user: "perbaiki bug ini"):
// 1. Tampilan HP menu cetak label terpotong di kanan (container width=max-content ~505px
//    karena .container{margin:0 auto} mematikan stretch sebagai flex item → ter-clipping
//    overflow:hidden section pada layar <505px). Fix: #section-cetak .container{width:100%}.
// 2. Sesi "langsung logout" saat PWA dibuka lagi di HP — token hanya di sessionStorage
//    (dihapus dari localStorage saat boot) → process-kill HP menghapusnya. Fix: salinan
//    resume di localStorage + auto-logout idle 2 jam (rdi_last_active).
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
let pass = 0,
  fail = 0;
function t(name, ok, ev) {
  if (ok === true) {
    pass++;
    console.log('PASS | ' + name + (ev ? ' | ' + ev : ''));
  } else if (ok === false) {
    fail++;
    console.log('FAIL | ' + name + ' | ' + ev);
  } else {
    console.log(ok + ' | ' + name + ' | ' + ev);
  }
}

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ============ BUG HP 1: container cetak harus selebar layar (fill s/d max-width) ============
const contRule = /#section-cetak\s+\.container\s*\{[^}]*width:\s*100%/.test(src);
t('HP1: #section-cetak .container has width:100%', contRule, contRule);
const contIdx = src.search(/#section-cetak\s+\.container\s*\{[^}]*width:\s*100%/);
t('HP1: width:100% rule present (idx>=0)', contIdx >= 0, 'idx=' + contIdx);
// rule harus setelah base .container{margin:0 auto} (di style block section-cetak)
const baseIdx = src.search(/\.container\{max-width:1100px;margin:0 auto/);
t('HP1: rule after base .container rule', contIdx > baseIdx && baseIdx > 0, 'base@' + baseIdx + ' fix@' + contIdx);

// ============ SESI 2: persistensi resume + idle 2 jam ============
const idleDef = /var\s+SESSION_IDLE_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src);
t('SES2: SESSION_IDLE_MS = 2 jam defined', idleDef, idleDef);

const lastActive = src.indexOf('rdi_last_active') >= 0;
t('SES2: rdi_last_active key used', lastActive, lastActive);

// writeSecureStorage harus dual-write (session + local) supaya sesi survive process-kill HP
const wssMatch = src.match(/function writeSecureStorage\(key,value\)\{[^}]*\}/);
const wss = wssMatch ? wssMatch[0] : '';
t('SES2: writeSecureStorage defined', !!wss, wss ? 'len=' + wss.length : 'NOT FOUND');
t(
  'SES2: writeSecureStorage dual-writes localStorage',
  /function writeSecureStorage\(key,value\)\{[\s\S]*?sessionStorage\.setItem\(key,value\)[\s\S]*?localStorage\.setItem\(key,value\)/.test(src),
  'session+local setItem pair'
);
t('SES2: writeSecureStorage touches activity', /function writeSecureStorage\(key,value\)\{[^}]*_touchSessionActivity\(\)/.test(wss), wss.includes('_touchSessionActivity'));

// clearSecureStorage harus menghapus keduanya (logout bersih)
t(
  'SES2: clearSecureStorage clears sessionStorage+localStorage',
  /function clearSecureStorage\(key\)\{[^}]*sessionStorage\.removeItem\(key\)[^}]*localStorage\.removeItem\(key\)/.test(src),
  'both removeItem'
);

// _touchSessionActivity helper
t('SES2: _touchSessionActivity helper defined', /function _touchSessionActivity\(\)/.test(src), 'defined');

// migration boot TIDAK boleh lagi menghapus salinan localStorage (resume copy)
const migDelete = src.includes("localStorage.removeItem('rdi_viewer_token')");
t('SES2: boot migration no longer deletes rdi_viewer_token copy', !migDelete, migDelete ? 'localStorage.removeItem(rdi_viewer_token) still present' : 'kept as resume copy');

// enforceSessionIdle: purge saat idle > 2 jam
t('SES2: enforceSessionIdle defined', /function enforceSessionIdle\(/.test(src), 'defined');
const enfIdx = src.search(/function enforceSessionIdle\(/);
t('SES2: enforceSessionIdle called at boot (top-level call)', src.indexOf('enforceSessionIdle(', enfIdx + 10) > 0, 'call after def');
t('SES2: enforceSessionIdle enforces SESSION_IDLE_MS', /function enforceSessionIdle\([\s\S]{0,1200}?Date\.now\(\)-la\s*<=\s*SESSION_IDLE_MS/.test(src), 'stale check vs SESSION_IDLE_MS');
// dipanggil sebelum boot gate hasValidSession di DOMContentLoaded
const gateIdx = src.indexOf('if(!hasValidSession()){showLoginGate()');
const firstCall = src.search(/enforceSessionIdle\(\)/);
t('SES2: enforceSessionIdle called before boot gate', gateIdx > 0 && firstCall > 0 && firstCall < gateIdx, 'call@' + firstCall + ' gate@' + gateIdx);

// listener visibility + heartbeat interval
t(
  'SES2: visibilitychange re-checks idle',
  /addEventListener\('visibilitychange',function\(\)\{[^}]*enforceSessionIdle\(/.test(src),
  'listener'
);
t(
  'SES2: heartbeat setInterval touches activity while visible',
  /setInterval\(function\(\)\{[^}]*visibilityState==='visible'[^}]*_touchSessionActivity\(\)/.test(src),
  '60s heartbeat'
);

// purge harus membersihkan ketiga kredensial + reset variabel global
const enfBody = (src.match(/function enforceSessionIdle\(\)\{[\s\S]*?return false;\}\}/) || [''])[0];
t('SES2: idle purge clears viewer token', enfBody.includes("clearSecureStorage('rdi_viewer_token')"), 'viewer');
t('SES2: idle purge clears editor key', enfBody.includes("clearSecureStorage('rdi_editor_key')"), 'editor');
t('SES2: idle purge resets globals', /EDITOR_KEY='';VIEWER_TOKEN='';VIEWER_MODE=true/.test(enfBody), 'globals reset');

console.log('---');
console.log('TOTAL | pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
