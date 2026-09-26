// F4.2 pure utils — loaded without defer before application logic (boot needs xe).
// Keep free of DOM/GAS deps so L1 can extract + unit-test them.

/* FIX 2026-09-27 (audit L1 "kontrak escaper"): sebelumnya String(s||'') membuat
   nilai 0 (dan false) menjadi string KOSONG. Tidak ada bug produksi saat ini karena
   getData/getHistory mengirim qty sebagai String(), tapi setiap field numerik dari
   getStockLedger/aset memang number — begitu satu path lupa String(), sel "Stok"
   di tabel master/kartu mobile tampil KOSONG untuk item berstok 0 (terbukti lewat
   probe mock qty:0 → sel stok = " "). Syarat benar: hanya null/undefined yang kosong. */
function xe(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* FIX KRITIS (XSS): escape backslash DULU sebelum quote, lalu HTML entities —
   urutan salah bikin payload \' bisa "break out" dari string JS di onclick. */
function xeJs(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/&/g,'&amp;');}

function ex(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function qrImgSrc(text,px){try{if(typeof qrcode==='function'){var q=qrcode(0,'M');q.addData(String(text||''));q.make();return q.createDataURL(Math.max(4,px||120),2);}}catch(e){}return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';}

function rakDisplay(v){if(!v)return v;var s=String(v).trim();var m=s.replace(/\s*:\s*\d+(\.\d+)?\s*$/,'').trim();return m||s;}

function buildQrPayload(id,nama,rak){var qrID=id&&String(id).trim()!==''?String(id).trim():'';return qrID+'|'+nama+'|'+(rak||'');}
