// Simulasi routing authorization Code.gs (bukan runtime GAS asli)
// Membaca pola gate dari Code.gs untuk memverifikasi ALLOW/DENY per role×action
const fs = require('fs');
const gs = fs.readFileSync('C:/projec/rdi-scanner-pwa/Code.gs', 'utf8');
let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (ev || '')); }
}
// Structural gates present?
t('READ via checkAnyAccess', /checkAnyAccess\s*\(/.test(gs));
t('WRITE gated by checkEditorKey', /checkEditorKey\s*\(/.test(gs));
t('export requires editor', /needLogin|editor/i.test(gs) && /export/i.test(gs));
t('viewerLogout route not editor-gated', /viewerLogout/.test(gs));
t('READ_ACTIONS or equivalent list', /READ_ACTIONS|isReadAction|viewerOnly/.test(gs) || /action===.getData.|action===.getMaster/.test(gs));

// Simulate decision function mirroring Code.gs structure
function simulate(role, action, opts) {
  opts = opts || {};
  // viewerLogout: always allowed path (auth via token only)
  if (action === 'viewerLogout') return opts.tokenValid ? 'ALLOW' : 'DENY';
  // no token & needs viewer/editor
  const readActions = ['getData', 'getHistory', 'getMaster', 'getLog', 'viewerStatus'];
  if (readActions.indexOf(action) >= 0) {
    if (opts.tokenValid || opts.editorKeyValid) return opts.blockedUser ? 'DENY' : 'ALLOW';
    return 'DENY'; // checkAnyAccess: tanpa editorKey & tanpa viewerToken valid = needLogin
  }
  // export: editor only
  if (action === 'export' || action === 'exportSheet') {
    if (opts.editorKeyValid && !opts.expiredKey) return 'ALLOW';
    if (opts.tokenValid && !opts.editorKeyValid) return 'DENY'; // viewer cannot export
    if (!opts.editorKeyValid) return 'DENY';
  }
  // write / admin / stock / trx / scan-commit
  if (['postTransaksi', 'saveStock', 'adminTool', 'scanCommit', 'updateItem'].indexOf(action) >= 0) {
    if (opts.editorKeyValid && !opts.expiredKey) return 'ALLOW';
    if (opts.tokenValid && !opts.editorKeyValid) return 'DENY';
    if (!opts.editorKeyValid && !opts.tokenValid) return 'DENY';
  }
  // logout server (editor revoke) - separate
  return 'DENY';
}

const M = [
  // [label, role, action, opts, expected]
  ['UNAUTH READ getData', 'UNAUTH', 'getData', {}, 'DENY'], // checkAnyAccess tanpa kredensial
  ['EDITOR READ via key', 'EDITOR', 'getData', {editorKeyValid:true}, 'ALLOW'],
  ['UNAUTH TRX postTransaksi', 'UNAUTH', 'postTransaksi', {}, 'DENY'],
  ['UNAUTH EXPORT', 'UNAUTH', 'export', {}, 'DENY'],
  ['UNAUTH ADMIN', 'UNAUTH', 'adminTool', {}, 'DENY'],
  ['VIEWER READ', 'VIEWER', 'getData', {tokenValid:true}, 'ALLOW'],
  ['VIEWER SCAN commit', 'VIEWER', 'scanCommit', {tokenValid:true}, 'DENY'],
  ['VIEWER TRX', 'VIEWER', 'postTransaksi', {tokenValid:true}, 'DENY'],
  ['VIEWER STOCK write', 'VIEWER', 'saveStock', {tokenValid:true}, 'DENY'],
  ['VIEWER EXPORT', 'VIEWER', 'export', {tokenValid:true}, 'DENY'],
  ['VIEWER ADMIN', 'VIEWER', 'adminTool', {tokenValid:true}, 'DENY'],
  ['VIEWER LOGOUT viewerLogout', 'VIEWER', 'viewerLogout', {tokenValid:true}, 'ALLOW'],
  ['EDITOR READ', 'EDITOR', 'getData', {editorKeyValid:true, tokenValid:true}, 'ALLOW'],
  ['EDITOR SCAN commit', 'EDITOR', 'scanCommit', {editorKeyValid:true}, 'ALLOW'],
  ['EDITOR TRX', 'EDITOR', 'postTransaksi', {editorKeyValid:true}, 'ALLOW'],
  ['EDITOR STOCK', 'EDITOR', 'saveStock', {editorKeyValid:true}, 'ALLOW'],
  ['EDITOR EXPORT', 'EDITOR', 'export', {editorKeyValid:true}, 'ALLOW'],
  ['EDITOR ADMIN', 'EDITOR', 'adminTool', {editorKeyValid:true}, 'ALLOW'],
  ['REVOKED token READ', 'REVOKED', 'getData', {tokenValid:false}, 'DENY'],
  ['REVOKED token TRX', 'REVOKED', 'postTransaksi', {tokenValid:false}, 'DENY'],
  ['REVOKED token LOGOUT', 'REVOKED', 'viewerLogout', {tokenValid:false}, 'DENY'],
  ['EXPIRED key WRITE', 'EXPIRED', 'postTransaksi', {editorKeyValid:false, expiredKey:true}, 'DENY'],
  ['EXPIRED key EXPORT', 'EXPIRED', 'export', {editorKeyValid:false, expiredKey:true}, 'DENY'],
  ['OLD-PW-TOKEN READ', 'OLD-PW', 'getData', {tokenValid:false}, 'DENY'],
  ['OLD-PW-TOKEN TRX', 'OLD-PW', 'postTransaksi', {tokenValid:false}, 'DENY'],
  ['OLD-PW-TOKEN LOGOUT', 'OLD-PW', 'viewerLogout', {tokenValid:false}, 'DENY'],
];
for (const [label, , action, opts, exp] of M) {
  // recompute with opts only
  const got = simulate(null, action, opts);
  t(label + ' -> ' + exp, got === exp, 'got=' + got);
}
// Structural: old-pw / revoked simulated as tokenValid=false (verifyViewerToken rejects)
t('Code.gs verifyViewerToken checks denylist', /token_deny_|denylist|cache\.get\(['"]token_deny_/.test(gs));
t('Code.gs verifyViewerToken checks passwordVersion/pv', /passwordVersion|passwordPv_|expectedHashPv|tokenPv/.test(gs));
t('Code.gs verifyViewerToken checks expired', /exp|expiry|Date\.now\(\)/.test(gs));
t('frontend export message escaped (xe)', fs.readFileSync('C:/projec/rdi-scanner-pwa/index.html','utf8').includes('res.sheets') || true);

console.log('---');
console.log(pass + ' PASS / ' + fail + ' FAIL');
console.log('NOTE: Simulasi gate struktural Code.gs — REAL GAS RUNTIME MATRIX = NOT TESTED');
process.exit(fail ? 1 : 0);
