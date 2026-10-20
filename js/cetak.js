// F4.3 pure cetak/label HTML builders — loaded without defer after js/util.js.
// Depends on global ex/qrImgSrc (js/util.js). Keep free of IIFE/DOM/GAS state.
// Orchestration (doCetak/generateOutput/setCetakMode/printRakLabels) stays in index.html IIFE.
// FIX 2026-10-19 (kiyes cetak): QR px per modul (160 → 10) + builder dipisah open/page/tail
// supaya popup bisa diisi per halaman (lihat cetakFillPopup di index.html).

function buildRakLabelHTML(raks){/* AUDIT FIX T-19 (v14.90): escaper ex + qrImgSrc di js/util.js (F4.2); kutip atribut wajib via ex(). */

var cols=3,perPage=cols*4;var cards=raks.map(function(rak){var qrData=encodeURIComponent(rak);return'<div class="lbl u-flex-none u-pad-20-0 u-mt-12 u-mt-10 u-flex-c-g1 u-label-sm u-mt-8">'
+'<div class="lbl-co">PT RAYARD DELI INDONESIA</div>'
+'<img class="lbl-qr" src="'+qrImgSrc(rak,10)+'" width="100%" height="100%" alt="Kode QR rak '+ex(rak)+'">'
+'<div class="lbl-code">'+ex(rak)+'</div>'
+'</div>';});var pages=[];for(var p=0;p<cards.length;p+=perPage){pages.push(cards.slice(p,p+perPage));}
var ph=pages.map(function(c,pi){var isLast=(pi===pages.length-1);return'<div class="page'+(isLast?' last-page':'')+'">'+c.join('')+'</div>';}).join('');return'<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Barcode Rak</title><style>'
+'@page{size:A4 portrait;margin:8mm}'
+'@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0}.page{page-break-after:always}.page.last-page{page-break-after:avoid}}'
+'*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}'
+'body{margin:0;background:#f2f2f2}'
+'.page{width:194mm;min-height:281mm;margin:0 auto 8mm;background:#fff;display:grid;grid-template-columns:repeat('+cols+',1fr);gap:6mm;padding:6mm;align-content:start}'
+'.lbl{border:1.5px dashed #999;border-radius:3mm;padding:4mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}'
+'.lbl-co{font-size:7pt;font-weight:700;color:#555;letter-spacing:.3px;margin-bottom:2mm}'
+'.lbl-qr{width:36mm;height:36mm}'
+'.lbl-code{margin-top:2.5mm;font-size:13pt;font-weight:800;letter-spacing:.5px;color:#111;word-break:break-word}'
+'.toolbar{max-width:194mm;margin:0 auto 6mm;padding:8px 0;display:flex;gap:var(--sp-10);justify-content:flex-end}'
+'.toolbar button{padding:var(--sp-10) var(--sp-18);border-radius:var(--br-8);border:none;font-weight:700;cursor:pointer;font-size:13px}'
+'.btn-print{background:#2563EB;color:#fff}'
+'@media print{.toolbar{display:none}}'
+'</style></head><body>'
+'<div class="toolbar"><button class="btn-print" onclick="window.print()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Cetak Sekarang</button></div>'
+ph
+'</body></html>';}

/* F-02 label templates — pure, no DOM. Default '4x6' = legacy 4×6=24.
   BUG FIX 2026-09-26: qrMm dimaksimalkan (15/13/20 → 27/17/22) — cell A4
   masih lega (sisa ≥0.4mm utk konten lain pada worst-case nama 2 baris + spec). */
var LABEL_TPL={
  '4x6':{cols:4,rows:6,qrMm:27},
  '3x8':{cols:3,rows:8,qrMm:17},
  '2x7':{cols:2,rows:7,qrMm:22}
};
function getLabelTpl(id){return LABEL_TPL[id]||LABEL_TPL['4x6'];}
function labelPerPage(id){var t=getLabelTpl(id);return t.cols*t.rows;}
function labelTglNow(){return new Date();}

/* FIX 2026-10-19 (P1): builder label dipecah open/page/tail.
   Syarat: labelOpenHTML+labelPageHTML*+labelTailHTML WAJIB byte-identik
   dengan keluaran buildLabelHTML lama (dibuktikan hash keluaran di probe cetak). */
function labelCardHTML(item,idx){var qrID=item.id&&item.id.trim()!==''?item.id.trim():('MAT'+String(idx+1).padStart(3,'0'));var qrPayload=qrID+'|'+item.nama+'|'+(item.rak||'');return'<div class="lbl2">'
+'<div class="lbl2-co">PT RAYARD DELI INDONESIA</div>'
+'<img class="lbl2-qr" data-qr="'+ex(qrPayload)+'" src="'+qrImgSrc(qrPayload,10)+'" width="100%" height="100%" alt="Kode QR item '+ex(qrID)+'">'
+'<div class="lbl2-kode">'+ex(qrID)+'</div>'
+'<div class="lbl2-nama">'+ex(item.nama)+'</div>'
+(item.spec?'<div class="lbl2-spec">'+ex(item.spec)+'</div>':'')
+'</div>';}
function labelOpenHTML(tplId,extra){var tpl=getLabelTpl(tplId);var cols=tpl.cols,rows=tpl.rows,qrMm=tpl.qrMm;
return'<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Label Barang</title><style>'
+'@page{size:A4 portrait;margin:0mm}'
+'@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#fff}.page{box-shadow:none!important;margin:0!important;page-break-after:always;page-break-inside:avoid}.page.last-page{page-break-after:avoid!important}}'
+'*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}'
+'body{background:#dde3ef;display:flex;flex-direction:column;align-items:center;padding:10px;gap:10px}'
+'.page{width:210mm;height:297mm;background:#fff;display:grid;grid-template-columns:repeat('+cols+',1fr);grid-template-rows:repeat('+rows+',1fr);grid-auto-rows:1fr;align-content:start;gap:0;padding:5mm;box-shadow:0 2px 16px rgba(0,0,0,.15)}'
+'.lbl2{border:1px dashed #99a3b8;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1.5mm 1mm;gap:.5mm;overflow:hidden;break-inside:avoid}'
+'.lbl2-co{font-size:4pt;font-weight:800;color:#5c7099;letter-spacing:.2px;white-space:nowrap}'
+'.lbl2-qr{width:'+qrMm+'mm;height:'+qrMm+'mm;flex-shrink:0}'
+'.lbl2-kode{font-family:"Courier New",monospace;font-size:8pt;font-weight:900;color:#1a3a7a;letter-spacing:.2px;word-break:break-all;line-height:1.15}'
+'.lbl2-nama{font-size:7.5pt;font-weight:700;color:#1a1d27;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-line-orient:vertical;overflow:hidden;padding:0 .5mm}'
+'.lbl2-spec{font-size:6pt;color:#5c7099;line-height:1.15;display:-webkit-box;-webkit-line-clamp:1;-webkit-line-orient:vertical;overflow:hidden;padding:0 .5mm}'
+'@media print{.lbl2{border:1px dashed #99a3b8!important}}'
+'</style></head><body>'+(extra||'')+'<div id="pw">';}
function labelPageHTML(chunk,tplId,isLast,idx0){var off=idx0||0;
return'<div class="page'+(isLast?' last-page':'')+'">'+chunk.map(function(item,i){return labelCardHTML(item,off+i);}).join('')+'</div>';}
function labelTailHTML(){return'</div>'+'<script>window.onload=function(){window.print();}<\/script>'+'</body></html>';}
function buildLabelHTML(items,mode,tplId){var tpl=getLabelTpl(tplId);
var perPage=tpl.cols*tpl.rows;
var pages=[];for(var p=0;p<items.length;p+=perPage)pages.push(items.slice(p,p+perPage));
var ph=pages.map(function(c,pi){var isLast=(pi===pages.length-1);return labelPageHTML(c,tplId,isLast,pi*perPage);}).join('');
return labelOpenHTML(tplId)+ph+labelTailHTML();}

/* FIX OFFLINE 2026-10-13: html2pdf 0.10.1 tadinya diambil dari cdnjs.cloudflare.com
   SETIAP kali operator menekan "Download Kartu Stok". Aplikasi ini offline-first, jadi
   fitur cetak tidak boleh butuh internet — sekarang self-host (js/html2pdf.bundle.min.js).
   Popup dibuat lewat window.open('','_blank') sehingga dokumennya about:blank dan path
   RELATIF tidak resolve; karena itu src harus URL ABSOLUT dari origin aplikasi.
   Kalau location tidak tersedia (harness test L1), jatuh ke CDN agar test tetap jalan. */
var H2P_LOCAL='';
try{ if(typeof location!=='undefined'&&location&&location.href){H2P_LOCAL=new URL('js/html2pdf.bundle.min.js',location.href).href;}}catch(e){}
var H2P_SRC=H2P_LOCAL||'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
/* FIX 2026-10-19: jsPDF lokal dipakai runner PDF per halaman (bundle html2pdf
   tidak mengekspos html2canvas/jsPDF global — diuji di probe cetak). */
var K_JSPDF_LOCAL='';
try{ if(typeof location!=='undefined'&&location&&location.href){K_JSPDF_LOCAL=new URL('js/jspdf.min.js',location.href).href;}}catch(e){}
var K_JSPDF_SRC=K_JSPDF_LOCAL||'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

function kartuTgl(now){now=now||new Date();return now.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});}
function kartuPdfFilename(now){now=now||new Date();var yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');return 'kartu-stok.'+yyyy+'.'+mm+'.'+dd+'.pdf';}

/* FIX 2026-10-19 (P1): builder kartu dipecah open/page/tail (byte-identik). */
function printOpenHTML(pSize,extra){var gridRows=pSize==='A5'?'1fr':'1fr 1fr';var pageRule=pSize==='A5'?'A5 landscape':'A4 portrait';var pageH=pSize==='A5'?'148.5mm':'297mm';var cutV='.page::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #bbb;transform:translateX(-50%);z-index:1}';var cutH=pSize==='A5'?'':'.page::after{content:"";position:absolute;top:50%;left:0;right:0;border-top:1px dashed #bbb;transform:translateY(-50%);z-index:1}';
return'<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Kartu Stok</title><style>'
+'@page{size:'+pageRule+';margin:0mm}'
+'@media print{'
+'*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
+'body{margin:0;background:#fff}'
+'.page{box-shadow:none!important;margin:0!important;page-break-after:always;page-break-inside:avoid}'
+'.page.last-page{page-break-after:avoid!important}'
+'}'
+'*{box-sizing:border-box;margin:0;padding:0}'
+'body{font-family:Arial,sans-serif;background:#dde3ef;display:flex;flex-direction:column;align-items:center;padding:10px;gap:10px}'
+'.page{width:210mm;height:'+pageH+';background:#fff;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:'+gridRows+';gap:3mm;padding:6mm;box-shadow:0 2px 16px rgba(0,0,0,.15);position:relative}'
+cutV+cutH
+'.kartu{display:flex;flex-direction:column;border:2px solid #1a2f5e;overflow:hidden;border-radius:1.5mm;background:#fff}'
+'.kartu-empty{border:1.5px dashed #c0c8d8;background:#f7f9fc}'
+'.bar{height:2.5mm;background:linear-gradient(90deg,#1a3a7a,#2e5fc7 60%,#38bdf8);flex-shrink:0}'
+'.kh{display:grid;grid-template-columns:1fr 22mm;background:#eef3ff;border-bottom:2px solid #1a2f5e;flex-shrink:0}'
+'.khl{padding:1.8mm 2mm;display:flex;flex-direction:column;gap:.8mm}'
+'.htop{display:flex;align-items:center;gap:1.5mm;padding-bottom:1mm;border-bottom:1px solid #b0bcd8;margin-bottom:.2mm}'
+'.la{display:flex;align-items:center;gap:1.5mm;flex:1}'
+'.li{width:5mm;height:5mm;background:linear-gradient(135deg,#1a3a7a,#2e5fc7);border-radius:1mm;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
+'.cn{font-size:5.5pt;font-weight:900;color:#1a3a7a;letter-spacing:.4px}'
+'.cs{font-size:4pt;color:#5c7099}'
+'.tb2{background:#1a3a7a;color:#fff;font-size:4.5pt;font-weight:700;padding:.6mm 1.5mm;border-radius:.6mm;white-space:nowrap;align-self:center}'
+'.id-row{display:flex;align-items:center;gap:1.5mm;padding:.5mm 0;border-bottom:1px solid #b0bcd8}'
+'.id-lbl{font-size:4.5pt;color:#5c7099;font-weight:600}'
+'.id-val{font-family:"Courier New",monospace;font-size:6.5pt;font-weight:900;color:#1a3a7a;letter-spacing:.5px}'
+'.ig{display:grid;grid-template-columns:auto 1fr;gap:.5mm 1.2mm;align-items:center}'
+'.il{font-size:4.5pt;color:#5c7099;font-weight:600;white-space:nowrap}'
+'.iv{font-size:6pt;font-weight:700;color:#1a1d27;border-bottom:1px solid #b0bcd8;min-height:3mm;padding-left:.6mm;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+'.iv.mono{font-family:"Courier New",monospace;color:#1a3a7a;font-weight:900;font-size:5.5pt}'
+'.spec-val{font-size:5.5pt;white-space:normal;line-height:1.4}'
+'.i2{display:grid;grid-template-columns:1fr 1fr;gap:1.2mm}'
+'.ic{display:flex;flex-direction:column;gap:.2mm}'
+'.ic .iv{font-size:5.5pt}'
+'.qa{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5mm;background:#fff;border-left:1px solid #b0bcd8;gap:.8mm}'
+'.qb{width:19mm;height:19mm;border:2px solid #1a3a7a;border-radius:.8mm;overflow:hidden;padding:.3mm;background:#fff}'
+'.qb img{width:100%;height:100%;display:block}'
+'.qk{font-size:4pt;font-weight:900;color:#1a3a7a;font-family:"Courier New",monospace;text-align:center;word-break:break-all;line-height:1.3}'
+'.ql{font-size:3.5pt;color:#5c7099;text-align:center;line-height:1.3}'
+'.ss{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:2px solid #1a2f5e;flex-shrink:0}'
+'.sc{padding:1mm 1.2mm;text-align:center;border-right:1px solid #b0bcd8}'
+'.sc:last-child{border-right:none}'
+'.sl{font-size:4pt;color:#5c7099;display:block;text-transform:uppercase}'
+'.sv{font-size:6.5pt;font-weight:700;display:block;min-height:2.8mm}'
+'.masuk .sv{color:#1a7a4a}.keluar .sv{color:#7a1a1a}.saldo .sv{color:#1a3a7a}'
+'.tt{flex:1;display:flex;flex-direction:column;overflow:hidden}'
+'.thr{display:grid;grid-template-columns:5mm 13mm 10mm 10mm 12mm 1fr;background:#1a3a7a;color:#fff;flex-shrink:0}'
+'.th{padding:1mm .7mm;font-size:4.5pt;font-weight:700;text-align:center;border-right:1px solid rgba(255,255,255,.4)}'
+'.th.last,.td.last{border-right:none}'
+'.tbd{flex:1;display:flex;flex-direction:column}'
+'.tr{display:grid;grid-template-columns:5mm 13mm 10mm 10mm 12mm 1fr;border-bottom:1px solid #8898b0;flex:1}'
+'.tr:nth-child(even){background:#f7f9ff}'
+'.ftr{background:#eef7f2!important}'
+'.td{padding:.5mm .7mm;font-size:5pt;border-right:1px solid #8898b0;display:flex;align-items:center;justify-content:center;text-align:center}'
+'.td.last{justify-content:flex-start;font-size:4.5pt;text-align:left;border-right:none}'
+'.td.no{color:#8b90a7;font-size:4.5pt}'
+'.td.grn{color:#1a7a4a;font-weight:700}.td.blu{color:#1a3a7a;font-weight:700}'
+'.kf{background:#eef3ff;border-top:1px solid #b0bcd8;padding:.6mm 1.8mm;display:flex;align-items:center;gap:2mm;flex-shrink:0}'
+'.kfl{font-size:3.5pt;color:#5c7099;flex:1}.kfr{font-size:3.5pt;color:#5c7099}.kfv{font-size:4pt;font-weight:700;color:#1a3a7a;margin-left:auto}'
+'@media print{'
+'.kartu{border:2px solid #1a2f5e!important}'
+'.kh{border-bottom:2px solid #1a2f5e!important}'
+'.ss{border-bottom:2px solid #1a2f5e!important}'
+'.tr{border-bottom:1px solid #8898b0!important}'
+'.td{border-right:1px solid #8898b0!important}'
+'.td.last{border-right:none!important}'
+'.th{border-right:1px solid rgba(255,255,255,.5)!important}'
+'.sc{border-right:1px solid #8898b0!important}'
+'.sc:last-child{border-right:none!important}'
+'.iv{border-bottom:1px solid #b0bcd8!important}'
+'*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'
+'}'
+'</style></head><body>'+(extra||'')+'<div id="pw">';}

function printPageHTML(chunk,tgl,isLast){
function kartu(item,idx){if(!item)return'<div class="kartu kartu-empty"></div>';var qrID=item.id&&item.id.trim()!==''?item.id.trim():('MAT'+String(idx+1).padStart(3,'0'));var qrPayload=qrID+'|'+item.nama+'|'+(item.rak||'');function qrSrc(text,px){try{if(typeof qrcode==='function'){var q=qrcode(0,'M');q.addData(String(text||''));q.make();return q.createDataURL(Math.max(4,px||120),2);}}catch(e){}return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';}var rows='';for(var n=2;n<=15;n++)rows+='<div class="tr"><div class="td no">'+n+'</div><div class="td"></div><div class="td"></div><div class="td"></div><div class="td"></div><div class="td last"></div></div>';return'<div class="kartu">'
+'<div class="bar"></div>'
+'<div class="kh">'
+'<div class="khl">'
+'<div class="htop"><div class="la"><div class="li"><svg viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="1" stroke="white" stroke-width="1.5"/><path d="M5 4V3a3 3 0 016 0v1" stroke="white" stroke-width="1.5"/></svg></div>'
+'<div><div class="cn">PT RAYARD DELI INDONESIA</div><div class="cs">Spare Part, Tools &amp; Indirect Inventory</div></div></div>'
+'<div class="tb2">KARTU STOK</div></div>'
+'<div class="id-row"><span class="id-lbl">ID Item</span><span class="id-val">'+ex(item.id||'—')+'</span></div>'
+'<div class="ig">'
+'<span class="il">No SJ/PO Terakhir</span><span class="iv mono">'+ex(item.noReferensi||'—')+'</span>'
+'<span class="il">Nama Material</span><span class="iv" style="font-size:6.5pt;white-space:normal;line-height:1.3">'+ex(item.nama)+'</span>'
+'<span class="il">Spesifikasi</span><span class="iv spec-val">'+ex(item.spec)+'</span>'
+'</div>'
+'<div class="i2"><div class="ic"><span class="il">Rak / Lokasi</span><span class="iv" style="font-weight:800;color:#1a3a7a">'+ex(item.rak||'—')+'</span></div>'
+'<div class="ic"><span class="il">Satuan</span><span class="iv">'+ex(item.unit||'Pcs')+'</span></div></div>'
+'<div class="i2" style="margin-top:.4mm"><div class="ic"><span class="il">User / Dept</span><span class="iv">'+ex(item.user||'—')+'</span></div>'
+'<div class="ic"><span class="il">BC / Non BC</span><span class="iv">'+ex(item.bc||'—')+'</span></div></div>'
+'</div>'
+'<div class="qa"><div class="qb"><img data-qr="'+ex(qrPayload)+'" src="'+qrSrc(qrPayload,10)+'" width="100%" height="100%" alt="Kode QR item '+ex(qrID)+'"></div>'
+'<div class="qk">'+ex(qrID)+'</div><div class="ql">Scan untuk Transaksi</div></div>'
+'</div>'
+'<div class="ss"><div class="sc masuk"><span class="sl">Total Masuk</span><span class="sv">'+ex(item.totalMasuk||0)+'</span></div>'
+'<div class="sc keluar"><span class="sl">Total Keluar</span><span class="sv">'+ex(item.totalKeluar||0)+'</span></div>'
+'<div class="sc saldo"><span class="sl">Stok Saldo</span><span class="sv">'+ex(item.qty)+'</span></div></div>'
+'<div class="tt"><div class="thr"><div class="th">No.</div><div class="th">Tanggal</div><div class="th">Masuk</div><div class="th">Keluar</div><div class="th">Saldo</div><div class="th last">Keterangan</div></div>'
+'<div class="tbd"><div class="tr ftr"><div class="td no">1</div><div class="td">'+ex(tgl)+'</div><div class="td"></div><div class="td"></div><div class="td blu">'+ex(item.qty)+'</div><div class="td last">Saldo saat cetak</div></div>'+rows+'</div></div>'
+'<div class="kf"><div class="kfl">Cetak: '+tgl+' | Form: WH-KS-001</div><div class="kfr">Vendor Terakhir: '+ex(item.vendor||'—')+'</div><div class="kfv">v5.0</div></div>'
+'</div>';}
return'<div class="page'+(isLast?' last-page':'')+'">'+chunk.map(function(item,i){return kartu(item,i);}).join('')+'</div>';}

function printTailHTML(mode,pdfFilename,pSize){var pdfOrient=pSize==='A5'?'landscape':'portrait';
var scriptAction=mode==='download'?'<script src="'+H2P_SRC+'"><\/script><script>window.onload=function(){if(typeof html2pdf!=="function"){document.getElementById("pw").innerHTML="<p style=\'font-family:sans-serif;padding:24px\'>Library html2pdf gagal dimuat. Periksa lalu coba lagi.</p>";return;}html2pdf().set({margin:0,filename:"'+pdfFilename+'",image:{type:"jpeg",quality:.98},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:"mm",format:"'+pSize.toLowerCase()+'",orientation:"'+pdfOrient+'"}}).from(document.getElementById("pw")).save().then(function(){setTimeout(function(){window.close();},1500);});}<\/script>':'<script>window.onload=function(){window.print();}<\/script>';
return'</div>'+scriptAction+'</body></html>';}

function buildPrintHTML(items,mode,pSize){var now=new Date();var tgl=kartuTgl(now);var pdfFilename=kartuPdfFilename(now);var cpp=pSize==='A5'?2:4;var pages=[];for(var p=0;p<items.length;p+=cpp){var c=items.slice(p,p+cpp);while(c.length<cpp)c.push(null);pages.push(c);}
var ph=pages.map(function(c,pi){var isLast=(pi===pages.length-1);return printPageHTML(c,tgl,isLast);}).join('');
return printOpenHTML(pSize)+ph+printTailHTML(mode,pdfFilename,pSize);}

/* FIX 2026-10-19 (RC-C): runner PDF kartu PER HALAMAN di dalam popup.
   html2pdf lama meraster SELURUH #pw jadi satu canvas → >14 halaman A4 (56 kartu)
   melewati batas canvas (32767 px) dan PDF keluar kosong. Sekarang: raster tiap
   .page → addImage ke jsPDF lokal → progres di #cetak-progress → doc.save().
   Fungsi ini mengembalikan BODY skrip (tanpa tag), disuntik via createElement. */
function kartuPdfRunnerSrc(fname,pSize,orient){var fmt=String(pSize||'A4').toLowerCase();var o=(pSize==='A5')?'landscape':'portrait';var wmm=(pSize==='A5')?210:210;var hmm=(pSize==='A5')?148.5:297;
var S='';
S+='(function(){var pages=Array.prototype.slice.call(document.querySelectorAll("#pw .page"));var total=pages.length,i=0,doc=null,done=false;';
S+='function msg(t){var e=document.getElementById("cetak-progress");if(e)e.textContent=t;}';
S+='function fail(e){if(done)return;done=true;msg("Gagal membuat PDF: "+((e&&e.message)?e.message:e));}';
S+='function JsPdf(){if(typeof jsPDF!=="undefined")return jsPDF;if(window.jspdf&&window.jspdf.jsPDF)return window.jspdf.jsPDF;return null;}';
S+='function step(){if(done)return;if(i>=total){done=true;msg("Menyimpan PDF…");try{doc.save("'+fname+'");}catch(e){fail(e);return;}setTimeout(function(){try{window.close();}catch(e){}},1500);return;}';
S+='msg("Merender halaman "+(i+1)+"/"+total+" …");';
S+='html2pdf().set({margin:0,image:{type:"jpeg",quality:.98},html2canvas:{scale:2,useCORS:true,logging:false}}).from(pages[i]).toCanvas().get("canvas").then(function(cv){';
S+='try{var C=JsPdf();if(!C)throw new Error("jsPDF tidak termuat");if(!doc)doc=new C({unit:"mm",format:"'+fmt+'",orientation:"'+o+'",compress:true});else doc.addPage();';
S+='doc.addImage(cv.toDataURL("image/jpeg",0.92),"JPEG",0,0,'+wmm+','+hmm+',undefined,"FAST");}catch(e){fail(e);return;}';
S+='i++;msg("Halaman "+i+"/"+total+" selesai …");setTimeout(step,30);},function(e){fail(e);});}';
S+='setTimeout(step,80);})();';
return S;}

function labelPdfFilename(now){now=now||new Date();var yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');return 'label-barang.'+yyyy+'.'+mm+'.'+dd+'.pdf';}

/* FIX 2026-10-19 (RC-D): PDF label dipecah init + draw(chunk, indeks absolut) supaya
   bisa digambar bertahap di main thread (progres, UI tidak beku). Keluaran PDF sama. */
function labelPDFInit(tplId){
  var J=(typeof jsPDF!=='undefined')?jsPDF:(typeof jspdf!=='undefined'&&jspdf&&jspdf.jsPDF)?jspdf.jsPDF:null;
  if(!J)throw new Error('jsPDF belum dimuat');
  var tpl=getLabelTpl(tplId),cols=tpl.cols,rows=tpl.rows,perPage=cols*rows,qrMm=tpl.qrMm;
  var doc=new J({unit:'mm',format:'a4',orientation:'portrait',compress:true});
  var pad=5,PW=210,PH=297,cw=(PW-pad*2)/cols,ch=(PH-pad*2)/rows;
  return {doc:doc,cols:cols,rows:rows,perPage:perPage,qrMm:qrMm,pad:pad,cw:cw,ch:ch,GAP:0.6,PT:0.3528};
}
function labelPDFDraw(st,items,i0,i1){
  var doc=st.doc,cols=st.cols,perPage=st.perPage,qrMm=st.qrMm,pad=st.pad,cw=st.cw,ch=st.ch,GAP=st.GAP,PT=st.PT;
  function clampLines(lines,max){lines=lines||[];if(lines.length>max){var last=lines[max-1]||'';lines=lines.slice(0,max);lines[max-1]=(last.length>1?last.slice(0,-1):last)+'…';}return lines;}
  for(var i=i0;i<i1&&i<items.length;i++){
    var item=items[i]||{};
    if(i>0&&i%perPage===0)doc.addPage();
    var p=i%perPage,x=pad+(p%cols)*cw,y=pad+Math.floor(p/cols)*ch;
    var qrID=item.id&&String(item.id).trim()!==''?String(item.id).trim():('MAT'+String(i+1).padStart(3,'0'));
    var payload=qrID+'|'+(item.nama||'')+'|'+(item.rak||'');
    doc.setFont('helvetica','bold');doc.setFontSize(7.5);
    var namaLines=clampLines(doc.splitTextToSize(String(item.nama||''),cw-2),2);
    doc.setFont('courier','bold');doc.setFontSize(8);
    var kodeLines=clampLines(doc.splitTextToSize(qrID,cw-2),2);
    var specLines=[];
    if(item.spec){doc.setFont('helvetica','normal');doc.setFontSize(6);specLines=clampLines(doc.splitTextToSize(String(item.spec),cw-2),1);}
    var hKode=kodeLines.length*8*PT*1.15,hNama=namaLines.length*7.5*PT*1.15,hSpec=specLines.length*6*PT*1.15;
    var hCo=4*PT*1.35,nElem=4+(specLines.length?1:0);
    var total=hCo+qrMm+hKode+hNama+hSpec+(nElem-1)*GAP;
    var cx=x+cw/2,cy=y+Math.max(1.5,(ch-total)/2);
    doc.setDrawColor(153,163,184);doc.setLineWidth(0.2);doc.setLineDashPattern([0.7,0.7],0);
    doc.rect(x+0.3,y+0.3,cw-0.6,ch-0.6);
    doc.setLineDashPattern([0,0],0);
    doc.setFont('helvetica','bold');doc.setFontSize(4);doc.setTextColor(92,112,153);
    doc.text('PT RAYARD DELI INDONESIA',cx,cy+4*PT*0.85,{align:'center'});cy+=hCo+GAP;
    try{doc.addImage(qrImgSrc(payload,10),'PNG',cx-qrMm/2,cy,qrMm,qrMm);}catch(e){}
    cy+=qrMm+GAP;
    doc.setFont('courier','bold');doc.setFontSize(8);doc.setTextColor(26,58,122);
    doc.text(kodeLines,cx,cy+8*PT*0.85,{align:'center'});cy+=hKode+GAP;
    doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(26,29,39);
    doc.text(namaLines,cx,cy+7.5*PT*0.85,{align:'center'});cy+=hNama+(specLines.length?GAP:0);
    if(specLines.length){doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(92,112,153);
      doc.text(specLines,cx,cy+6*PT*0.85,{align:'center'});}
  }
  return st;
}
function buildLabelPDFDoc(items,tplId){
  var st=labelPDFInit(tplId);
  labelPDFDraw(st,items,0,items.length);
  return {doc:st.doc,fname:labelPdfFilename()};
}

var _labelPdfBusy=false;
function downloadLabelPDF(items,tplId){
  if(_labelPdfBusy)return '';
  var st;
  try{st=labelPDFInit(tplId);}catch(e){banner(true,'Gagal membuat PDF label: '+(e&&e.message?e.message:e),'err');return '';}
  _labelPdfBusy=true;
  var fname=labelPdfFilename(),i=0,CHUNK=4;
  var el=document.getElementById('cetak-sel-label');
  var base=el?el.innerHTML:'';
  function banner(show,t,kind){try{if(kind&&typeof cetakNotice==='function'){cetakNotice(t,kind);return;}if(typeof cetakBanner==='function')cetakBanner(show,t);}catch(e){}}
  banner(true,'Membuat PDF label… 0/'+items.length);
  function tick(){
    try{
      var end=Math.min(items.length,i+CHUNK);
      labelPDFDraw(st,items,i,end);i=end;
      if(el)el.textContent='Membuat PDF… '+i+'/'+items.length;
      banner(true,'Membuat PDF label… '+i+'/'+items.length);
      if(i<items.length){setTimeout(tick,0);return;}
      if(el)el.innerHTML=base;
      banner(true,'Menyimpan PDF label…');
      try{st.doc.save(fname);}catch(e){banner(true,'Gagal menyimpan PDF: '+(e&&e.message?e.message:e),'err');}
      _labelPdfBusy=false;
      setTimeout(function(){banner(false);},1200);
      if(typeof updateCetakCount==='function')updateCetakCount();
    }catch(e){
      _labelPdfBusy=false;
      if(el)el.innerHTML=base;
      banner(true,'Gagal membuat PDF label: '+(e&&e.message?e.message:e),'err');
    }
  }
  setTimeout(tick,0);
  return fname;
}
