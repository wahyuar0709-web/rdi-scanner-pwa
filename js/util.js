// F4.2 pure utils — loaded without defer before application logic (boot needs xe).
// Keep free of DOM/GAS deps so L1 can extract + unit-test them.

function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* FIX KRITIS (XSS): escape backslash DULU sebelum quote, lalu HTML entities —
   urutan salah bikin payload \' bisa "break out" dari string JS di onclick. */
function xeJs(s){return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/&/g,'&amp;');}

function ex(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function qrImgSrc(text,px){try{if(typeof qrcode==='function'){var q=qrcode(0,'M');q.addData(String(text||''));q.make();return q.createDataURL(Math.max(4,px||120),2);}}catch(e){}return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';}

function rakDisplay(v){if(!v)return v;var s=String(v).trim();var m=s.replace(/\s*:\s*\d+(\.\d+)?\s*$/,'').trim();return m||s;}

function buildQrPayload(id,nama,rak){var qrID=id&&String(id).trim()!==''?String(id).trim():'';return qrID+'|'+nama+'|'+(rak||'');}
