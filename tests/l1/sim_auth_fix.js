// Verifikasi fix passwordVersion + revoke denylist writer (mocked GAS APIs)
function constantTimeEquals_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;var r=0;for(var i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
var SECRET='test-secret';
function getViewerSecret(){return SECRET;}
var Utilities={
  getUuid:function(){return 'uuid-'+Math.random().toString(36).slice(2);},
  newBlob:function(s){return{getBytes:function(){return Buffer.from(String(s),'utf8');},getDataAsString:function(){return String(s);}};},
  base64EncodeWebSafe:function(buf){return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
  base64DecodeWebSafe:function(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Buffer.from(s,'base64');},
  computeHmacSha256Signature:function(data,key){
    var crypto=require('crypto');
    return crypto.createHmac('sha256',String(key)).update(Buffer.from(String(data),'utf8')).digest();
  },
  DigestAlgorithm:{SHA_256:'SHA_256'},
  Charset:{UTF_8:'utf8'},
  computeDigest:function(alg,data,cs){
    var crypto=require('crypto');
    return Array.from(crypto.createHash('sha256').update(String(data),String(cs||'utf8')).digest());
  }
};
var denyStore={};
var CacheService={getScriptCache:function(){return{
  get:function(k){return denyStore[k]||null;},
  put:function(k,v,ttl){denyStore[k]=v;}
};}};

// paste fixed functions from Code.gs (makeViewerToken, passwordPv_, verifyViewerToken simplified without sheet re-check when we inject status)
function passwordPv_(stored) {
  try {
    if (!stored) return '';
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'pv:' + String(stored), Utilities.Charset.UTF_8);
    var hex = '';
    for (var i = 0; i < digest.length; i++) {
      var b = digest[i] < 0 ? digest[i] + 256 : digest[i];
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex.slice(0, 16);
  } catch(e) { return ''; }
}
function makeViewerToken(username, nama, pv) {
  var expiry = Date.now() + 12*60*60*1000;
  var jti = Utilities.getUuid();
  var pvStr = (pv == null || pv === '') ? '' : String(pv);
  var payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(username+'|'+nama+'|'+expiry+'|'+jti+'|'+pvStr).getBytes());
  var sigB64 = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, getViewerSecret()));
  return payloadB64 + '.' + sigB64;
}
function apiViewerLogout(body) {
  try {
    var token = String(body && body.viewerToken || '');
    if (!token) return { status:'ok' };
    var parts = token.split('.');
    if (parts.length !== 2) return { status:'ok' };
    var expectedSig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], getViewerSecret()));
    if (!constantTimeEquals_(parts[1], expectedSig)) return { status:'ok' };
    var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var bits = payload.split('|');
    var expiry = parseInt(bits[2], 10);
    var jti = bits[3] || '';
    if (!jti) return { status:'ok' };
    var ttlSec = Math.max(1, Math.min(12*60*60, Math.floor((expiry - Date.now()) / 1000)));
    try { CacheService.getScriptCache().put('token_deny_' + jti, '1', ttlSec); } catch(e) {}
    return { status:'ok' };
  } catch(e) { return { status:'ok' }; }
}
// verify with injectable account state (mirrors Code.gs logic)
var SpreadsheetApp={getActiveSpreadsheet:function(){return{getSheetByName:function(){return null;}};}};
function verifyViewerToken(token) {
  try {
    var parts = String(token||'').split('.');
    if (parts.length !== 2) return { ok:false };
    var expectedSig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], getViewerSecret()));
    if (!constantTimeEquals_(parts[1], expectedSig)) return { ok:false };
    var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var bits = payload.split('|');
    var expiry = parseInt(bits[2], 10);
    if (!expiry || Date.now() > expiry) return { ok:false, expired:true };
    var username = bits[0];
    var nama = bits[1];
    var jti = bits[3] || '';
    if (jti) {
      var denied = CacheService.getScriptCache().get('token_deny_' + jti);
      if (denied) return { ok:false, revoked:true };
    }
    var cache = CacheService.getScriptCache();
    var statusKey = 'viewer_status_' + String(username||'').toLowerCase();
    var cachedStatus = cache.get(statusKey);
    var aktif = true;
    var expectedPv = null;
    var expectedHashPv = null;
    if (cachedStatus) {
      try {
        var cs = JSON.parse(cachedStatus);
        aktif = !!cs.aktif;
        expectedPv = cs.pv;
        expectedHashPv = cs.hpv;
      } catch(e) {}
    } else {
      try { cache.put(statusKey, JSON.stringify({aktif:aktif, pv:expectedPv, hpv:expectedHashPv}), 60); } catch(e3) {}
    }
    if (!aktif) return { ok:false, revoked:true };
    var tokenPv = bits[4] || '';
    if (expectedPv != null && expectedPv !== '' && tokenPv && String(tokenPv) !== String(expectedPv)) {
      return { ok:false, revoked:true };
    }
    if (tokenPv && expectedHashPv && expectedPv !== tokenPv && String(tokenPv) !== String(expectedHashPv)) {
      return { ok:false, revoked:true };
    }
    if (!tokenPv && expectedHashPv) {
      return { ok:false, revoked:true };
    }
    return { ok:true, username:username, nama:nama };
  } catch(e) { return { ok:false }; }
}

var pass=0, fail=0;
function assert(name, cond){ if(cond){pass++; console.log('PASS: '+name);} else {fail++; console.log('FAIL: '+name);} }

// T1: token contains pv field
var hash1=passwordPv_('salt$100000$abcdef');
var tok1=makeViewerToken('viewer1','Nama',hash1);
var payload1=Utilities.newBlob(Utilities.base64DecodeWebSafe(tok1.split('.')[0])).getDataAsString();
assert('T1 token payload has 5 fields', payload1.split('|').length===5);
assert('T1 token pv equals hash fingerprint', payload1.split('|')[4]===hash1);

// T2: same account state → verify ok
var st=JSON.stringify({aktif:true,pv:'',hpv:hash1});
denyStore['viewer_status_viewer1']=st;
assert('T2 valid token verifies', verifyViewerToken(tok1).ok===true);

// T3: password changed (hpv changes) → invalid
denyStore['viewer_status_viewer1']=JSON.stringify({aktif:true,pv:'',hpv:passwordPv_('salt$100000$changed')});
assert('T3 password change invalidates session', verifyViewerToken(tok1).ok===false);
assert('T3 reason revoked', verifyViewerToken(tok1).revoked===true);

// T4: passwordVersion column mismatch → invalid
denyStore['viewer_status_viewer1']=JSON.stringify({aktif:true,pv:'2',hpv:hash1});
// token has pv=hash1, expectedPv=2 → mismatch
assert('T4 passwordVersion mismatch invalidates', verifyViewerToken(tok1).ok===false);

// T5: account disabled → invalid
denyStore['viewer_status_viewer1']=JSON.stringify({aktif:false,pv:'',hpv:hash1});
assert('T5 Aktif=FALSE invalidates', verifyViewerToken(tok1).ok===false);

// T6: logout denylist writer exists and revokes
delete denyStore['viewer_status_viewer1'];
denyStore['viewer_status_viewer1']=JSON.stringify({aktif:true,pv:'',hpv:hash1});
assert('T6 before logout ok', verifyViewerToken(tok1).ok===true);
var out=apiViewerLogout({viewerToken:tok1});
assert('T6 logout returns ok', out.status==='ok');
var jti=payload1.split('|')[3];
assert('T6 denylist written for jti', !!denyStore['token_deny_'+jti]);
assert('T6 after logout revoked', verifyViewerToken(tok1).ok===false && verifyViewerToken(tok1).revoked===true);

// T7: old 4-field token rejected when account has hpv
var oldPayload=Utilities.base64EncodeWebSafe(Utilities.newBlob('viewer1|Nama|'+(Date.now()+1000000)+'|oldjti').getBytes());
var oldSig=Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(oldPayload, SECRET));
var oldTok=oldPayload+'.'+oldSig;
denyStore['viewer_status_viewer1']=JSON.stringify({aktif:true,pv:'',hpv:hash1});
assert('T7 pre-fix 4-field token force re-login', verifyViewerToken(oldTok).ok===false);

// T8: forged signature rejected
var forged=payload1+'.'+Utilities.base64EncodeWebSafe(Buffer.from('bad'));
assert('T8 forged sig rejected', verifyViewerToken(forged).ok===false);

// T9: expired token rejected
var expPayload=Utilities.base64EncodeWebSafe(Utilities.newBlob('viewer1|N|'+(Date.now()-1000)+'|j9|').getBytes());
var expTok=expPayload+'.'+Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(expPayload, SECRET));
assert('T9 expired rejected', verifyViewerToken(expTok).expired===true);

console.log('\nRESULT: '+pass+' PASS, '+fail+' FAIL');
process.exit(fail?1:0);
