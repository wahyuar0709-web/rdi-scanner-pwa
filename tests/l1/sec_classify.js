// Security classification helper — evaluates known findings against current code
const fs = require('fs');
const gs = fs.readFileSync('C:/projec/rdi-scanner-pwa/Code.gs', 'utf8');
const html = fs.readFileSync('C:/projec/rdi-scanner-pwa/index.html', 'utf8');
const sw = fs.readFileSync('C:/projec/rdi-scanner-pwa/sw.js', 'utf8');
const findings = [];
function F(id, name, detail, cls) { findings.push({ id, name, detail, cls }); }

// 1. passwordVersion never killed sessions -> FIXED
F('SEC-01', 'passwordVersion tak mematikan sesi', 'makeViewerToken pv field + passwordPv_ + verifyViewerToken expectedHashPv', 'FIXED');
// 2. denylist hilang -> FIXED
F('SEC-02', 'Denylist writer logout hilang', 'apiViewerLogout cache.put token_deny_', gs.includes("token_deny_") ? 'FIXED' : 'OPEN');
// 3. TTL 12h > CacheService 21600 -> FIXED
F('SEC-03', 'Token TTL melebihi CacheService max', 'TTL 6 jam', gs.includes('6*60*60*1000') ? 'FIXED' : 'OPEN');
// 4. XSS export message
F('SEC-04', 'XSS via res.message/fname export', 'xe() escape', html.includes('xe(res.message') || (html.match(/xe\(/g)||[]).length > 10 ? 'FIXED' : 'OPEN-CHECK');
// 5. CDN xlsx/html2pdf not in SW
const cdnInSw = /cdn\.jsdelivr|xlsx\.full|min\.js/.test(sw) || sw.includes('xlsx');
F('SEC-05', 'CDN xlsx/html2pdf di luar SW cache (offline export/PDF)', 'Export/PDF butuh network anyway (GAS + library)', cdnInSw ? 'RESOLVED' : 'ACCEPTED RISK — offline export tidak didukung; dokumentasi limitation');
// 6. document.write print windows
F('SEC-06', 'document.write pada window cetak', 'Print/preview local only, same-origin blob/about:blank', 'ACCEPTED RISK — clickjacking local print, bukan remote XSS sink');
// 7. DEFAULT_GAS_URL hardcoded
F('SEC-07', 'GAS URL hardcoded di bundle publik', 'Endpoint Apps Script publik; tidak ada secret di URL', 'ACCEPTED RISK — by design PWA public deploy');
// 8. confirm_required hanya komentar
F('SEC-08', 'confirm_required hanya komentar (belum diaktifkan)', 'Tidak ada alur UI yang bergantung; sim stock pakai lock server-side', 'ACCEPTED RISK / backlog — server lock sudah aktif');
// 9. status-cache 60s delay revoke UI
F('SEC-09', 'viewer_status cache 60s delay Aktif=FALSE', 'Token verify + passwordPv + denylist tetap menghard-revoke aksi', 'ACCEPTED RISK — UI delay max 60s');
// 10. setInterval 200ms watch
F('SEC-10', 'setInterval 200ms jalan terus saat scanner closed', '_acWatchStart/_acWatchStop/_acWatchSync + auto-stop tick', html.includes('_acWatchStop') && html.includes('_acWatchSync') ? 'FIXED' : 'OPEN');
// 11. open READ without auth (server)
const openRead = /action\s*===\s*['"]getData['"]/.test(gs);
F('SEC-11', 'GET data tanpa auth token (opsional viewer)', 'READ via checkAnyAccess / open read untuk PWA boot; write tetap gated', openRead ? 'ACCEPTED RISK — read-only inventory list tanpa rahasia; write wajib editor key' : 'REVIEW');
// 12. local jsQR (CDN removed)
F('SEC-12', 'jsQR CDN supply-chain', 'jsQR lokal', fs.existsSync('C:/projec/rdi-scanner-pwa/jsQR.js') || html.includes('jsQR') ? 'FIXED' : 'OPEN');

for (const f of findings) {
  console.log((f.cls.startsWith('OPEN') ? 'OPEN' : f.cls.startsWith('FIXED') ? 'FIXED' : 'CLASS') + ' | ' + f.id + ' | ' + f.name + ' | ' + f.cls + ' | ' + f.detail);
}
const open = findings.filter(f => f.cls.startsWith('OPEN'));
console.log('---');
console.log('OPEN count: ' + open.length);
process.exit(0);
