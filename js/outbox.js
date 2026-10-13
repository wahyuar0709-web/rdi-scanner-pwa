// F4.4 API client + outbox queue — loaded without defer after js/util.js + js/cetak.js.
// Depends on window.__rdiConfig bridge (set in index.html IIFE) for GAS_URL/EDITOR_KEY/VIEWER_TOKEN/VIEWER_MODE.
// Orchestration (submitTransaksi/checkTransaksiDraft/forceReLogin/showStatus) stays in index.html IIFE.

function __rdiCfg(){return window.__rdiConfig||{};}
function __rdiGet(name){var c=__rdiCfg();return typeof c[name]==='function'?c[name]():c[name];}
function __needLogin(msg){var c=__rdiCfg();if(typeof c.onNeedLogin==='function')c.onNeedLogin(msg);}

// ===== SECTION: GAS API COMMUNICATION (gasGet/gasPost/parse) =====
function checkUrl(){if(!__rdiGet('getGasUrl')){throw new Error('GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.');}}
function _parseGasJson(text){var trimmed=String(text||'').trim();if(trimmed.charAt(0)==='<'){var e=new Error('Server mengembalikan halaman, bukan data (kemungkinan sesi Google/cache bermasalah)');e._nonJson=true;e._unknown=true;throw e;}
return JSON.parse(trimmed);}
// FIX DBG-02 (2026-10-13): hasil yang "tidak diketahui" harus DIBEDAKAN dari penolakan
// definitif. Dua kegagalan yang dulu jadi pesan teks serupa:
//   - transport/parsing (offline, timeout, halaman HTML dari GAS) -> `unknown`
//   - penolakan server yang sah (stok kurang, item arsip, validasi) -> definite
// Client tidak boleh menebak dari teks pesan: menebak salah berarti transaksi hilang.
// `uncertain` datang dari backend (Code.gs genericError_(fn, true)) untuk exception
// yang terjadi SETELAH baris ditulis ke sheet.
function _errResult(msg){return {status:'error', unknown:true, uncertain:true, message:msg};}
function gasGet(params){var GAS_URL=__rdiGet('getGasUrl');var EDITOR_KEY=__rdiGet('getEditorKey');var VIEWER_TOKEN=__rdiGet('getViewerToken');if(!GAS_URL){return Promise.resolve({status:'error',message:'GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.'});}
/* FIX KRITIS: kredensial pindah ke BODY POST (READ_ACTIONS di backend), bukan query string
   — query string bocor ke log server/proxy/referrer. */
params=Object.assign({},params);if(EDITOR_KEY)params.editorKey=EDITOR_KEY;else if(VIEWER_TOKEN)params.viewerToken=VIEWER_TOKEN;function attempt(bust){var body=Object.assign({},params);if(bust)body._r=Date.now();return fetch(GAS_URL,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).then(function(r){return r.text();}).then(function(t){return _parseGasJson(t);});}
return attempt(false).catch(function(err){if(err&&err._nonJson)return attempt(true);throw err;}).then(function(res){if(res&&res.needLogin)__needLogin(res.message);return res;}).catch(function(err){var msg=(err&&err._nonJson)?'Server tidak merespons dengan benar (coba refresh halaman)':'Network error: '+(err&&err.message?err.message:'unknown');return _errResult(msg);});}
function gasPost(body){var GAS_URL=__rdiGet('getGasUrl');var VIEWER_MODE=__rdiGet('isViewerMode');var EDITOR_KEY=__rdiGet('getEditorKey');if(!GAS_URL){return Promise.resolve({status:'error',message:'GAS URL belum diset. Buka Lainnya → Pengaturan lalu tempel URL /exec.'});}
if(VIEWER_MODE){return Promise.resolve({status:'error',message:'Mode lihat-saja: perubahan data tidak diizinkan.'});}
body.editorKey=EDITOR_KEY;var canRetry=!!body.requestId;function attempt(){return fetch(GAS_URL,{method:'POST',redirect:'follow',cache:'no-store',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).then(function(r){return r.text();}).then(function(t){return _parseGasJson(t);});}
return attempt().catch(function(err){if(err&&err._nonJson&&canRetry)return attempt();throw err;}).then(function(res){if(res&&res.needLogin)__needLogin(res.message);return res;}).catch(function(err){var msg=(err&&err._nonJson)?'Server tidak merespons dengan benar (coba refresh halaman)':'Network error: '+err.message;return _errResult(msg);});}
function genRequestId(){try{if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();}catch(e){}
return'rid-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}

// ===== SECTION: OUTBOX QUEUE (FE-01 multi-slot + flush) =====
/* FIX FE-01: outbox multi-slot + flush on online/boot — dulu ditulis tapi tidak pernah dikirim ulang. */
function readOutbox(){try{var raw=localStorage.getItem('rdi_trx_outbox');if(!raw)return[];var v=JSON.parse(raw);if(!v)return[];if(Array.isArray(v))return v;if(v&&v.payload)return[v];return[];}catch(e){return[];}}
// FIX OFF-01 (2026-09-27, audit): dulu writeOutbox memakai slice(-20) → ketika antrean
// melewati 20, transaksi offline TERLAMA hilang tanpa jejak (terbukti runtime: cap-1..cap-5
// hilang, user tidak diberi tahu apa pun). Tiga perubahan:
//   1) OUTBOX_MAX dinaikkan 20 → 100 (masih jauh di bawah kuota localStorage)
//   2) saat hampir penuh: coba flush dulu, lalu beri PERINGATAN eksplisit ke user lewat
//      bridge onOutboxFull (index.html menampilkan status bar) — tidak diam-diam lagi
//   3) writeOutbox tidak lagi membuang entri diam-diam; ia potong hanya sebagai jaring
//      pengaman terakhir dan MEMBUKTIKAN lewat peringatan yang sama
var OUTBOX_MAX = 100;
var OUTBOX_WARN_AT = 80; // mulai ingatkan_user di 80% kapasitas
function __outboxFull(note) {
  try {
    var c = window.__rdiConfig || {};
    if (typeof c.onOutboxFull === 'function') c.onOutboxFull({ count: readOutbox().length, max: OUTBOX_MAX, note: note || 'full' });
  } catch (e) {}
}
function writeOutbox(list) {
  try {
    if (!list || !list.length) { localStorage.removeItem('rdi_trx_outbox'); return; }
    if (list.length > OUTBOX_MAX) {
      // jaring pengaman terakhir — TETAP diberi tahu, tidak pernah diam
      __outboxFull('trimmed');
      list = list.slice(list.length - OUTBOX_MAX);
    }
    localStorage.setItem('rdi_trx_outbox', JSON.stringify(list));
  } catch (e) {
    // kuota penuh / storage diblokir: beri tahu, jangan diam
    __outboxFull('storage-error');
  }
}
function pushOutbox(payload) {
  if (!payload) return;
  var rid = payload.requestId;
  var list = readOutbox().filter(function (e) { return !(e.payload && rid && e.payload.requestId === rid); });
  if (list.length >= OUTBOX_WARN_AT) {
    // coba kirim dulu yang lama; kalau masih penuh →unning ke user
    try { flushOutbox(); } catch (e) {}
    list = readOutbox().filter(function (e) { return !(e.payload && rid && e.payload.requestId === rid); });
    if (list.length >= OUTBOX_WARN_AT) __outboxFull('near-full');
  }
  list.push({ payload: payload, savedAt: Date.now() });
  writeOutbox(list);
}
// FIX DBG-03 (2026-10-13): requestId kosong TIDAK BOLEH berarti "buang semua".
// Sebelumnya `if(!rid){writeOutbox([]);return;}` — jadi satu pemanggil yang kehilangan
// requestId menghapus seluruh antrean transaksi offline milik operator. Sekarang no-op
// + peringatan, karena antrean milik banyak transaksi, bukan satu.
function removeOutboxByRequestId(rid){if(!rid){try{var c=window.__rdiConfig||{};if(typeof c.onFlushUncertain==='function')c.onFlushUncertain('Entri outbox dilewati: requestId kosong (antrean lain tetap aman).');else console.warn('[outbox] removeOutboxByRequestId tanpa rid — antrean tidak diubah');}catch(e){}return;}writeOutbox(readOutbox().filter(function(e){return !(e.payload&&e.payload.requestId===rid);}));}
var _outboxFlushing=false;var _outboxRetryTimer=null;
function scheduleOutboxRetry(){if(_outboxRetryTimer)return;_outboxRetryTimer=setTimeout(function(){_outboxRetryTimer=null;flushOutbox();},30000);}
function flushOutbox(){if(_outboxFlushing)return Promise.resolve();var VIEWER_MODE=__rdiGet('isViewerMode');var GAS_URL=__rdiGet('getGasUrl');if(VIEWER_MODE||!GAS_URL)return Promise.resolve();if(typeof navigator!=='undefined'&&navigator.onLine===false)return Promise.resolve();if(!readOutbox().length)return Promise.resolve();_outboxFlushing=true;
function step(){var list=readOutbox();if(!list.length||(typeof navigator!=='undefined'&&navigator.onLine===false)){_outboxFlushing=false;return Promise.resolve();}
var entry=list[0];if(!entry||!entry.payload){writeOutbox(list.slice(1));return step();}
return gasPost(entry.payload).then(function(res){var rid=entry.payload.requestId;
if(res&&(res.status==='ok'||res.status==='partial')){removeOutboxByRequestId(rid);return step();}
// FIX DBG-02 (2026-10-13): hasil TIDAK DIPASTIKAN (transport gagal, server balas HTML, atau
// backend menandai `uncertain` karena exception setelah baris ditulis) -> JANGAN buang entri.
// Dulu cabang ini hanya mengenali teks "Network error", sehingga balasan non-JSON masuk ke
// branch `status==='error'` di bawah dan entri dihapus permanen padahal mungkin sudah commit
// di server. Ancaman nyata: transaksi hilang diam-diam, lalu operator input ulang = duplikat.
if(res&&(res.unknown||res.uncertain)){var cu=__rdiCfg();if(typeof cu.onFlushUncertain==='function')cu.onFlushUncertain(res.message);else console.warn('[outbox]',res.message||'Hasil belum pasti — transaksi disimpan di antrean');_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();}
if(res&&res.status==='error'){removeOutboxByRequestId(rid);var c=__rdiCfg();if(typeof c.onFlushError==='function')c.onFlushError(res.message);else console.warn('[outbox]',res.message||'Retry transaksi gagal');_outboxFlushing=false;return Promise.resolve();}
_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();
}).catch(function(){_outboxFlushing=false;scheduleOutboxRetry();return Promise.resolve();});}
return step();}

window.gasGet=gasGet;window.gasPost=gasPost;window.flushOutbox=flushOutbox;window.readOutbox=readOutbox;window.writeOutbox=writeOutbox;window.pushOutbox=pushOutbox;window.removeOutboxByRequestId=removeOutboxByRequestId;window.genRequestId=genRequestId;window.checkUrl=checkUrl;
