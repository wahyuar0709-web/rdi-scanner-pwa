// F4.4 API client + outbox queue — loaded without defer after js/util.js + js/cetak.js.
// Depends on window.__rdiConfig bridge (set in index.html IIFE) for GAS_URL/EDITOR_KEY/VIEWER_TOKEN/VIEWER_MODE.
// Orchestration (submitTransaksi/checkTransaksiDraft/forceReLogin/showStatus) stays in index.html IIFE.

function __rdiCfg(){return window.__rdiConfig||{};}
function __rdiGet(name){var c=__rdiCfg();return typeof c[name]==='function'?c[name]():c[name];}
function __needLogin(msg){var c=__rdiCfg();if(typeof c.onNeedLogin==='function')c.onNeedLogin(msg);}

// ===== SECTION: GAS API COMMUNICATION (gasGet/gasPost/parse) =====
function checkUrl(){if(!__rdiGet('getGasUrl')){throw new Error('GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.');}}
function _parseGasJson(text){var trimmed=String(text||'').trim();if(trimmed.charAt(0)==='<'){var e=new Error('Server mengembalikan halaman, bukan data (kemungkinan sesi Google/cache bermasalah)');e._nonJson=true;throw e;}
return JSON.parse(trimmed);}
function gasGet(params){var GAS_URL=__rdiGet('getGasUrl');var EDITOR_KEY=__rdiGet('getEditorKey');var VIEWER_TOKEN=__rdiGet('getViewerToken');if(!GAS_URL){return Promise.resolve({status:'error',message:'GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.'});}
/* FIX KRITIS: kredensial pindah ke BODY POST (READ_ACTIONS di backend), bukan query string
   — query string bocor ke log server/proxy/referrer. */
params=Object.assign({},params);if(EDITOR_KEY)params.editorKey=EDITOR_KEY;else if(VIEWER_TOKEN)params.viewerToken=VIEWER_TOKEN;function attempt(bust){var body=Object.assign({},params);if(bust)body._r=Date.now();return fetch(GAS_URL,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).then(function(r){return r.text();}).then(function(t){return _parseGasJson(t);});}
return attempt(false).catch(function(err){if(err&&err._nonJson)return attempt(true);throw err;}).then(function(res){if(res&&res.needLogin)__needLogin(res.message);return res;}).catch(function(err){var msg=(err&&err._nonJson)?'Server tidak merespons dengan benar (coba refresh halaman)':'Network error: '+(err&&err.message?err.message:'unknown');return{status:'error',message:msg};});}
function gasPost(body){var GAS_URL=__rdiGet('getGasUrl');var VIEWER_MODE=__rdiGet('isViewerMode');var EDITOR_KEY=__rdiGet('getEditorKey');if(!GAS_URL){return Promise.resolve({status:'error',message:'GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.'});}
if(VIEWER_MODE){return Promise.resolve({status:'error',message:'Mode lihat-saja: perubahan data tidak diizinkan.'});}
body.editorKey=EDITOR_KEY;var canRetry=!!body.requestId;function attempt(){return fetch(GAS_URL,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).then(function(r){return r.text();}).then(function(t){return _parseGasJson(t);});}
return attempt().catch(function(err){if(err&&err._nonJson&&canRetry)return attempt();throw err;}).then(function(res){if(res&&res.needLogin)__needLogin(res.message);return res;}).catch(function(err){var msg=(err&&err._nonJson)?'Server tidak merespons dengan benar (coba refresh halaman)':'Network error: '+err.message;return{status:'error',message:msg};});}
function genRequestId(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
return'rid-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}

// ===== SECTION: OUTBOX QUEUE (FE-01 multi-slot + flush) =====
/* FIX FE-01: outbox multi-slot + flush on online/boot — dulu ditulis tapi tidak pernah dikirim ulang. */
function readOutbox(){try{var raw=localStorage.getItem('rdi_trx_outbox');if(!raw)return[];var v=JSON.parse(raw);if(!v)return[];if(Array.isArray(v))return v;if(v&&v.payload)return[v];return[];}catch(e){return[];}}
function writeOutbox(list){try{if(!list||!list.length){localStorage.removeItem('rdi_trx_outbox');return;}localStorage.setItem('rdi_trx_outbox',JSON.stringify(list.slice(-20)));}catch(e){}}
function pushOutbox(payload){if(!payload)return;var rid=payload.requestId;var list=readOutbox().filter(function(e){return !(e.payload&&rid&&e.payload.requestId===rid);});list.push({payload:payload,savedAt:Date.now()});writeOutbox(list);}
function removeOutboxByRequestId(rid){if(!rid){writeOutbox([]);return;}writeOutbox(readOutbox().filter(function(e){return !(e.payload&&e.payload.requestId===rid);}));}
var _outboxFlushing=false;var _outboxRetryTimer=null;
function scheduleOutboxRetry(){if(_outboxRetryTimer)return;_outboxRetryTimer=setTimeout(function(){_outboxRetryTimer=null;flushOutbox();},30000);}
function flushOutbox(){if(_outboxFlushing)return Promise.resolve();var VIEWER_MODE=__rdiGet('isViewerMode');var GAS_URL=__rdiGet('getGasUrl');if(VIEWER_MODE||!GAS_URL)return Promise.resolve();if(typeof navigator!=='undefined'&&navigator.onLine===false)return Promise.resolve();if(!readOutbox().length)return Promise.resolve();_outboxFlushing=true;
function step(){var list=readOutbox();if(!list.length||(typeof navigator!=='undefined'&&navigator.onLine===false)){_outboxFlushing=false;return Promise.resolve();}
var entry=list[0];if(!entry||!entry.payload){writeOutbox(list.slice(1));return step();}
return gasPost(entry.payload).then(function(res){var rid=entry.payload.requestId;
if(res&&(res.status==='ok'||res.status==='partial')){removeOutboxByRequestId(rid);return step();}
if(res&&/^Network error/.test(res.message||'')){_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();}
if(res&&res.status==='error'){removeOutboxByRequestId(rid);var c=__rdiCfg();if(typeof c.onFlushError==='function')c.onFlushError(res.message);else console.warn('[outbox]',res.message||'Retry transaksi gagal');_outboxFlushing=false;return Promise.resolve();}
_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();
}).catch(function(){_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();});}
return step();}

window.gasGet=gasGet;window.gasPost=gasPost;window.flushOutbox=flushOutbox;window.readOutbox=readOutbox;window.writeOutbox=writeOutbox;window.pushOutbox=pushOutbox;window.removeOutboxByRequestId=removeOutboxByRequestId;window.genRequestId=genRequestId;window.checkUrl=checkUrl;
