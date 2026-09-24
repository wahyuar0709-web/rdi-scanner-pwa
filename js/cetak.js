// F4.3 pure cetak/label HTML builders — loaded without defer after js/util.js.
// Depends on global ex/qrImgSrc (js/util.js). Keep free of IIFE/DOM/GAS state.
// Orchestration (doCetak/generateOutput/setCetakMode/printRakLabels) stays in index.html IIFE.

function buildRakLabelHTML(raks){/* AUDIT FIX T-19 (v14.90): escaper ex + qrImgSrc di js/util.js (F4.2); kutip atribut wajib via ex(). */

var cols=3,perPage=cols*4;var cards=raks.map(function(rak){var qrData=encodeURIComponent(rak);return'<div class="lbl u-flex-none u-pad-20-0 u-mt-12 u-mt-10 u-flex-c-g1 u-label-sm u-mt-8">'
+'<div class="lbl-co">PT RAYARD DELI INDONESIA</div>'
+'<img class="lbl-qr" src="'+qrImgSrc(rak,160)+'" width="100%" height="100%" alt="Kode QR rak '+ex(rak)+'">'
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

/* F-02 label templates — pure, no DOM. Default '4x6' = legacy 4×6=24. */
var LABEL_TPL={
  '4x6':{cols:4,rows:6,qrMm:15},
  '3x8':{cols:3,rows:8,qrMm:13},
  '2x7':{cols:2,rows:7,qrMm:20}
};
function getLabelTpl(id){return LABEL_TPL[id]||LABEL_TPL['4x6'];}
function labelPerPage(id){var t=getLabelTpl(id);return t.cols*t.rows;}

function buildLabelHTML(items,mode,tplId){var now=new Date();var yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');var pdfFilename='label-barang.'+yyyy+'.'+mm+'.'+dd+'.pdf';

var tpl=getLabelTpl(tplId);
var cols=tpl.cols,rows=tpl.rows,perPage=cols*rows,qrMm=tpl.qrMm;
var cards=items.map(function(item,idx){var qrID=item.id&&item.id.trim()!==''?item.id.trim():('MAT'+String(idx+1).padStart(3,'0'));var qrPayload=qrID+'|'+item.nama+'|'+(item.rak||'');return'<div class="lbl2">'
+'<div class="lbl2-co">PT RAYARD DELI INDONESIA</div>'
+'<img class="lbl2-qr" data-qr="'+ex(qrPayload)+'" src="'+qrImgSrc(qrPayload,120)+'" width="100%" height="100%" alt="Kode QR item '+ex(qrID)+'">'
+'<div class="lbl2-kode">'+ex(qrID)+'</div>'
+'<div class="lbl2-nama">'+ex(item.nama)+'</div>'
+(item.spec?'<div class="lbl2-spec">'+ex(item.spec)+'</div>':'')
+'</div>';});
var pages=[];for(var p=0;p<cards.length;p+=perPage)pages.push(cards.slice(p,p+perPage));
var ph=pages.map(function(c,pi){var isLast=(pi===pages.length-1);return'<div class="page'+(isLast?' last-page':'')+'">'+c.join('')+'</div>';}).join('');
var scriptAction=mode==='download'?'<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script><script>window.onload=function(){var pgs=document.querySelectorAll(".page");var pdf=html2pdf();var seq=Promise.resolve();pdf.set({margin:0,filename:"'+pdfFilename+'",image:{type:"jpeg",quality:.98},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}}).from(document.getElementById("pw")).save().then(function(){setTimeout(function(){window.close();},1500);});}<\/script>':'<script>window.onload=function(){window.print();}<\/script>';
return'<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Label Barang</title><style>'
+'@page{size:A4 portrait;margin:0mm}'
+'@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;background:#fff}.page{box-shadow:none!important;margin:0!important;page-break-after:always;page-break-inside:avoid}.page.last-page{page-break-after:avoid!important}}'
+'*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}'
+'body{background:#dde3ef;display:flex;flex-direction:column;align-items:center;padding:10px;gap:10px}'
+'.page{width:210mm;height:297mm;background:#fff;display:grid;grid-template-columns:repeat('+cols+',1fr);grid-template-rows:repeat('+rows+',1fr);grid-auto-rows:1fr;align-content:start;gap:0;padding:5mm;box-shadow:0 2px 16px rgba(0,0,0,.15)}'
+'.lbl2{border:1px dashed #99a3b8;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1.5mm 1mm;gap:.5mm;overflow:hidden;break-inside:avoid}'
+'.lbl2-co{font-size:3pt;font-weight:800;color:#5c7099;letter-spacing:.2px;white-space:nowrap}'
+'.lbl2-qr{width:'+qrMm+'mm;height:'+qrMm+'mm;flex-shrink:0}'
+'.lbl2-kode{font-family:"Courier New",monospace;font-size:6pt;font-weight:900;color:#1a3a7a;letter-spacing:.2px;word-break:break-all;line-height:1.15}'
+'.lbl2-nama{font-size:5.5pt;font-weight:700;color:#1a1d27;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-line-orient:vertical;overflow:hidden;padding:0 .5mm}'
+'.lbl2-spec{font-size:4.5pt;color:#5c7099;line-height:1.15;display:-webkit-box;-webkit-line-clamp:1;-webkit-line-orient:vertical;overflow:hidden;padding:0 .5mm}'
+'@media print{.lbl2{border:1px dashed #99a3b8!important}}'
+'</style></head><body><div id="pw">'+ph+'</div>'+scriptAction+'</body></html>';}

function buildPrintHTML(items,mode,pSize){var now=new Date();var tgl=now.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});var yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');var pdfFilename='kartu-stok.'+yyyy+'.'+mm+'.'+dd+'.pdf';var cpp=pSize==='A5'?2:4;var pages=[];for(var p=0;p<items.length;p+=cpp){var c=items.slice(p,p+cpp);while(c.length<cpp)c.push(null);pages.push(c);}
/* AUDIT FIX T-19 (v14.90): escaper ex pindah ke js/util.js (F4.2). */
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
+'<div class="qa"><div class="qb"><img data-qr="'+ex(qrPayload)+'" src="'+qrSrc(qrPayload,160)+'" width="100%" height="100%" alt="Kode QR item '+ex(qrID)+'"></div>'
+'<div class="qk">'+ex(qrID)+'</div><div class="ql">Scan untuk Transaksi</div></div>'
+'</div>'
+'<div class="ss"><div class="sc masuk"><span class="sl">Total Masuk</span><span class="sv">'+ex(item.totalMasuk||0)+'</span></div>'
+'<div class="sc keluar"><span class="sl">Total Keluar</span><span class="sv">'+ex(item.totalKeluar||0)+'</span></div>'
+'<div class="sc saldo"><span class="sl">Stok Saldo</span><span class="sv">'+ex(item.qty)+'</span></div></div>'
+'<div class="tt"><div class="thr"><div class="th">No.</div><div class="th">Tanggal</div><div class="th">Masuk</div><div class="th">Keluar</div><div class="th">Saldo</div><div class="th last">Keterangan</div></div>'
+'<div class="tbd"><div class="tr ftr"><div class="td no">1</div><div class="td">'+ex(tgl)+'</div><div class="td"></div><div class="td"></div><div class="td blu">'+ex(item.qty)+'</div><div class="td last">Saldo saat cetak</div></div>'+rows+'</div></div>'
+'<div class="kf"><div class="kfl">Cetak: '+tgl+' | Form: WH-KS-001</div><div class="kfr">Vendor Terakhir: '+ex(item.vendor||'—')+'</div><div class="kfv">v5.0</div></div>'
+'</div>';}
var ph=pages.map(function(c,pi){var isLast=(pi===pages.length-1);return'<div class="page'+(isLast?' last-page':'')+'">'+c.map(function(item,i){return kartu(item,i);}).join('')+'</div>';}).join('');var gridRows=pSize==='A5'?'1fr':'1fr 1fr';var pageRule=pSize==='A5'?'A5 landscape':'A4 portrait';var pdfOrient=pSize==='A5'?'landscape':'portrait';var pageH=pSize==='A5'?'148.5mm':'297mm';var cutV='.page::before{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #bbb;transform:translateX(-50%);z-index:1}';var cutH=pSize==='A5'?'':'.page::after{content:"";position:absolute;top:50%;left:0;right:0;border-top:1px dashed #bbb;transform:translateY(-50%);z-index:1}';var scriptAction=mode==='download'?'<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script><script>window.onload=function(){html2pdf().set({margin:0,filename:"'+pdfFilename+'",image:{type:"jpeg",quality:.98},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:"mm",format:"'+pSize.toLowerCase()+'",orientation:"'+pdfOrient+'"}}).from(document.getElementById("pw")).save().then(function(){setTimeout(function(){window.close();},1500);});}<\/script>':'<script>window.onload=function(){window.print();}<\/script>';return'<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Kartu Stok</title><style>'
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
+'</style></head><body><div id="pw">'+ph+'</div>'+scriptAction+'</body></html>';}
