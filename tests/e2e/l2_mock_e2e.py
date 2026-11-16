# -*- coding: utf-8 -*-
"""L2 E2E RDI Scanner PWA — browser sungguhan (Chromium headless), backend GAS di-mock.

Semua request ke GAS di-intercept (page.route) dan dijawab data sintetis.
TIDAK ADA request ke produksi, TIDAK ADA mutasi spreadsheet.
Level: L2 (browser runtime, backend simulasi). Bukan L3/L4.
Jalankan:
  python C:/Users/lenov/.agents/skills/webapp-testing/scripts/with_server.py ^
    --server "python -m http.server 8099 --bind 127.0.0.1" --port 8099 ^
    -- python tests/e2e/l2_mock_e2e.py
"""
import json
import sys
import threading
import time
import functools
from http.server import HTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

REPO = r'C:\projec\rdi-scanner-pwa'
GAS = 'https://mock.gas/exec'
SHOT = r'C:\Users\lenov\AppData\Local\Temp\opencode\e2e'

ROWS = [
    {'id': 'AUTO-BBA70602', 'nama': 'Akrilik 3mm', 'spec': '1220x2440', 'qty': 5, 'unit': 'Lembar',
     'rak': 'A-01', 'kategori': 'Bahan', 'vendor': 'PT Sumber', 'noReferensi': 'PO-1',
     'totalMasuk': 10, 'totalKeluar': 5, 'minStock': 2, 'tglMasukTerakhir': '12/11/2026', 'status': 'Aktif'},
    {'id': 'BRG-002', 'nama': 'Bearing 6204', 'spec': 'NSK', 'qty': 1, 'unit': 'Pcs',
     'rak': 'B-02', 'kategori': 'Sparepart', 'vendor': 'PT Lain',
     'totalMasuk': 3, 'totalKeluar': 2, 'minStock': 2, 'tglMasukTerakhir': '10/11/2026', 'status': 'Aktif'},
    {'id': 'BRG-003', 'nama': 'Oli Hidrolik AW68', 'spec': '20L', 'qty': 0, 'unit': 'Liter',
     'rak': 'C-03', 'kategori': 'Consumable', 'minStock': 0, 'tglMasukTerakhir': '01/11/2026', 'status': 'Arsip'},
]

RAK_ROWS = [
    {'id': 'AUTO-BBA70602', 'rak': 'A-01', 'qty': 3},
    {'id': 'AUTO-BBA70602', 'rak': 'C-05', 'qty': 2},
    {'id': 'BRG-002', 'rak': 'B-02', 'qty': 1},
]

HIST = {
    'AUTO-BBA70602': [
        {'id': 'AUTO-BBA70602', 'timestamp': '12/11/2026 08:15', 'jenis': 'PINDAH', 'qty': 2,
         'saldoSesudah': 5, 'rak': 'C-05', 'keterangan': 'PINDAH DARI: A-01', 'admin': 'Wahyu (Gudang)'},
        {'id': 'AUTO-BBA70602', 'timestamp': '10/11/2026 09:00', 'jenis': 'MASUK', 'qty': 5,
         'saldoSesudah': 5, 'rak': 'A-01', 'vendor': 'PT Sumber', 'noReferensi': 'PO-1',
         'keterangan': 'awal', 'admin': 'Wahyu (Gudang)'},
    ],
    'BRG-002': [
        {'id': 'BRG-002', 'timestamp': '10/11/2026 10:00', 'jenis': 'KELUAR', 'qty': 2,
         'saldoSesudah': 1, 'rak': 'B-02', 'keterangan': 'maintenance', 'admin': 'Ops'},
    ],
}

FEED = [
    {'id': 'AUTO-BBA70602', 'nama': 'Akrilik 3mm', 'spec': '1220x2440', 'timestamp': '12/11/2026 08:15',
     'jenis': 'PINDAH', 'qty': 2, 'saldoSesudah': 5, 'rak': 'C-05', 'keterangan': 'PINDAH DARI: A-01',
     'admin': 'Wahyu (Gudang)', 'vendor': '', 'noReferensi': ''},
    {'id': 'BRG-002', 'nama': 'Bearing 6204', 'spec': 'NSK', 'timestamp': '10/11/2026 10:00',
     'jenis': 'KELUAR', 'qty': 2, 'saldoSesudah': 1, 'rak': 'B-02', 'keterangan': 'maintenance',
     'admin': 'Ops', 'vendor': '', 'noReferensi': ''},
    {'id': 'AUTO-BBA70602', 'nama': 'Akrilik 3mm', 'spec': '1220x2440', 'timestamp': '10/11/2026 09:00',
     'jenis': 'MASUK', 'qty': 5, 'saldoSesudah': 5, 'rak': 'A-01', 'keterangan': 'awal',
     'admin': 'Wahyu (Gudang)', 'vendor': 'PT Sumber', 'noReferensi': 'PO-1'},
]

posted = []    # hanya postTransaksi
allreq = []    # semua request GAS (untuk addItem/updateItem/archiveItem)
STATE = {'offline': False}  # disinkronkan dengan ctx.set_offline oleh test


def item_detail(iid):
    base = next(r for r in ROWS if r['id'] == iid)
    it = dict(base)
    it['rakBreakdown'] = [dict(x) for x in RAK_ROWS if x['id'] == iid]
    return it


def handle_gas(route):
    if STATE['offline']:
        route.abort('internetdisconnected')
        return
    try:
        body = json.loads(route.request.post_data or '{}')
    except Exception:
        body = {}
    act = body.get('action')
    allreq.append(body)
    if act == 'getData':
        resp = {'status': 'ok', 'total': len(ROWS), 'rows': [dict(r) for r in ROWS]}
    elif act == 'getMasterLists':
        resp = {'status': 'ok', 'uom': ['Pcs', 'Lembar', 'Liter'],
                'rak': ['A-01', 'B-02', 'C-03', 'C-05'],
                'vendor': ['PT Sumber', 'PT Lain'],
                'kategori': ['Bahan', 'Sparepart', 'Consumable']}
    elif act == 'getItem':
        iid = (body.get('id') or '').upper()
        it = next((r for r in ROWS if r['id'] == iid), None)
        resp = ({'status': 'ok', 'item': item_detail(iid)} if it
                else {'status': 'error', 'message': 'Item ' + iid + ' tidak ditemukan'})
    elif act == 'getRakBreakdownAll':
        resp = {'status': 'ok', 'rows': [dict(x) for x in RAK_ROWS]}
    elif act == 'getHistory':
        resp = {'status': 'ok', 'rows': [dict(x) for x in HIST.get((body.get('id') or '').upper(), [])]}
    elif act == 'getAllHistory':
        resp = {'status': 'ok', 'rows': [dict(x) for x in FEED]}
    elif act == 'getLedger':
        resp = {'status': 'ok', 'entries': [dict(x) for x in HIST.get((body.get('id') or '').upper(), [])]}
    elif act == 'getDashboard':
        resp = {'status': 'error', 'message': 'mock: fallback lokal'}  # sengaja: uji renderDashboardLocal
    elif act == 'postTransaksi':
        posted.append(body)
        resp = {'status': 'ok', 'saldoSesudah': 5}
    elif act == 'login':
        resp = {'status': 'ok', 'token': 'TOK-E2E', 'role': 'viewer', 'nama': 'Wahyu Viewer'}
    elif act in ('viewerLogout', 'healthCheck'):
        resp = {'status': 'ok', 'version': 'v5.31'}
    else:  # updateItem / addItem / archiveItem / addMasterValue / aset-* / lainnya
        resp = {'status': 'ok'}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(resp))


results = []


def step(name, fn=None):
    t0 = time.time()
    try:
        if fn:
            fn()
        results.append(('PASS', name, time.time() - t0))
        print('PASS |', name)
    except Exception as e:
        results.append(('FAIL', name + ' :: ' + type(e).__name__ + ': ' + str(e)[:300], time.time() - t0))
        print('FAIL |', name, '::', type(e).__name__, str(e)[:300])


def expect(cond, msg):
    if not cond:
        raise AssertionError(msg)


EDITOR_INIT = """
const now = String(Date.now());
localStorage.setItem('rdi_gas_url', 'https://mock.gas/exec');
localStorage.setItem('rdi_editor_key', 'E2E-KEY');
localStorage.setItem('rdi_editor_key_set_at', now);
sessionStorage.setItem('rdi_editor_key', 'E2E-KEY');
sessionStorage.setItem('rdi_editor_key_set_at', now);
localStorage.setItem('rdi_user', JSON.stringify({name:'Wahyu', dept:'Gudang'}));
localStorage.setItem('rdi_last_active', now);
// tangkap teks splash tepat sebelum elemen dihapus (deterministik, tanpa race)
(function(){
  const orig = Node.prototype.removeChild;
  Node.prototype.removeChild = function(c){
    try { if (c && c.id === 'boot-splash') {
      const u = c.querySelector('#boot-splash-user');
      window.__e2eSplashText = u ? u.textContent : '';
    } } catch(e) {}
    return orig.call(this, c);
  };
})();
"""


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    Handler = functools.partial(SimpleHTTPRequestHandler, directory=REPO)
    httpd = HTTPServer(('127.0.0.1', 0), Handler)
    port = httpd.server_address[1]
    BASE = 'http://127.0.0.1:%d' % port
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print('static server:', BASE)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 390, 'height': 844},
                                  locale='id-ID', timezone_id='Asia/Jakarta')
        ctx.route('**/mock.gas/**', handle_gas)
        ctx.add_init_script(EDITOR_INIT)
        page = ctx.new_page()
        page.on('dialog', lambda d: d.accept())
        page.on('pageerror', lambda e: results.append(('FAIL', 'pageerror: ' + str(e)[:200], 0)))

        # 1. Boot splash: operator terlihat saat loading
        page.goto(BASE + '/index.html', wait_until='domcontentloaded')
        page.wait_for_function("window.__e2eSplashText !== undefined", timeout=20000)
        splash = page.evaluate("window.__e2eSplashText") or ''
        step('L2-01 splash memuat "Operator: Wahyu" saat loading',
             lambda: expect('Operator: Wahyu' in splash, 'isi splash=' + repr(splash)))

        # 2. Sesi editor: login gate tertutup, data tampil
        page.wait_for_selector('#login-gate', state='hidden', timeout=15000)
        page.wait_for_function("document.body.textContent.includes('Akrilik 3mm')", timeout=15000)
        step('L2-02 sesi editor: gate tidak muncul, master list termuat', None)

        n = (page.text_content('#inv-count-n') or '').strip()
        step('L2-03 jumlah item = 3', lambda: expect(n == '3', 'count=' + n))

        # 3. Detail item dari master (kartu mobile)
        # CATATAN: klik tepat di NAMA item tidak membuka detail (handler tooltip
        # [data-tt] memanggil stopPropagation fase capture - lihat laporan akhir);
        # tap area kartu lain (chip ID) yang dipakai user, itu yang diuji.
        page.locator('.ilc3-id').first.click()
        page.wait_for_selector('#item-detail-sheet.show', timeout=8000)
        det = page.text_content('#item-detail-sheet') or ''
        step('L2-04 detail item terbuka (ID tampil)',
             lambda: expect('AUTO-BBA70602' in det, 'ID tidak di detail'))
        page.keyboard.press('Escape')
        page.wait_for_selector('#item-detail-sheet.show', state='detached', timeout=8000)
        step('L2-05 Escape menutup detail item', None)

        # 4. Edit Item -> Pindah Rak (pintu masuk baru)
        page.locator('.ilc3-id').first.click()
        page.wait_for_selector('#item-detail-sheet.show', timeout=8000)
        page.locator('#item-detail-sheet button', has_text='Edit').first.click()
        page.wait_for_selector('#edit-sheet.show', timeout=8000)
        eid = page.input_value('#edit-item-id')
        step('L2-06 edit sheet: item terpilih benar',
             lambda: expect(eid == 'AUTO-BBA70602', 'edit-item-id=' + str(eid)))
        page.locator('#edit-sheet button', has_text='Pindah Rak').first.click()
        page.wait_for_selector('#pindah-sheet.show', timeout=8000)
        pi = page.input_value('#pindah-item')
        nopt = page.eval_on_selector_all('#pindah-asal option', 'els => els.length')
        step('L2-07 modal pindah: item benar + 2 opsi rak asal',
             lambda: expect('AUTO-BBA70602' in pi and nopt == 2, 'item=' + pi + ' opts=' + str(nopt)))

        # validasi: rak sama
        page.select_option('#pindah-asal', 'A-01')
        page.fill('#pindah-tujuan', 'A-01')
        page.click('#btn-pindah-submit')
        bar = page.text_content('#pindah-sbar') or ''
        step('L2-08 tolak: rak tujuan = rak asal',
             lambda: expect('harus berbeda' in bar, 'bar=' + bar))
        # qty lebih dari sisa -> AUTO-JEPIT ke maksimum (desain), bukan ditolak
        page.fill('#pindah-qty', '9')
        qv = page.input_value('#pindah-qty')
        step('L2-09 qty > sisa dijepit otomatis ke 3 (sisa rak asal)',
             lambda: expect(qv == '3', 'qty=' + qv))
        # valid pindah
        page.fill('#pindah-tujuan', 'C-05')
        page.fill('#pindah-qty', '2')
        page.evaluate("document.getElementById('ket-input').value='tes e2e'")
        page.click('#btn-pindah-submit')
        page.wait_for_function(
            "((document.getElementById('pindah-sbar')||{}).textContent||'').includes('Berhasil')",
            timeout=10000)
        bar = page.text_content('#pindah-sbar') or ''
        step('L2-10 pindah sukses: "Berhasil: 2 Lembar pindah A-01 → C-05"',
             lambda: expect('pindah A-01 → C-05' in bar, 'bar=' + bar))
        pj = [x for x in posted if x.get('jenis') == 'PINDAH']
        ok = (len(pj) == 1 and pj[0].get('itemId') == 'AUTO-BBA70602'
              and pj[0].get('rakAsal') == 'A-01' and pj[0].get('rak') == 'C-05'
              and pj[0].get('qty') == 2 and pj[0].get('keterangan') == 'tes e2e'
              and bool(pj[0].get('requestId')) and 'Wahyu' in (pj[0].get('admin') or ''))
        step('L2-11 payload PINDAH benar (rakAsal/tujuan/qty/requestId/admin)',
             lambda: expect(ok, json.dumps(pj, ensure_ascii=False)[:300]))
        page.wait_for_selector('#pindah-sheet.show', state='detached', timeout=8000)
        step('L2-12 modal pindah menutup otomatis', None)

        # 5. Menu Lainnya: caption versi + operator (visibilitas di HP)
        page.click('#tab-more')
        page.wait_for_function(
            "((document.getElementById('sheet-version-label')||{}).textContent||'').includes('v15.41')",
            timeout=8000)
        cap = page.text_content('#sheet-version-label') or ''
        step('L2-13 caption Lainnya: "v15.41" + "Operator: Wahyu"',
             lambda: expect('v15.41' in cap and 'Operator: Wahyu' in cap, 'cap=' + cap))
        page.screenshot(path=SHOT + r'\l2_lainnya_caption.png')

        # 6. Transaksi MASUK via scanner (input manual ID, tanpa kamera)
        page.click('#tab-scanner')
        page.fill('#scan-id-input', 'AUTO-BBA70602')
        page.click('#btn-lookup')
        page.wait_for_selector('#btn-masuk', state='visible', timeout=10000)
        page.click('#btn-masuk')
        page.fill('#qty-input', '1')
        page.fill('#rak-input', 'D-99')
        page.fill('#vendor-input', 'PT Baru')
        page.fill('#noref-input', 'PO-9')
        page.click('#btn-submit')
        page.wait_for_timeout(2500)
        trx = [x for x in posted if x.get('jenis') == 'MASUK']
        ok = (len(trx) == 1 and trx[0].get('rak') == 'D-99' and trx[0].get('qty') == 1
              and trx[0].get('noReferensi') == 'PO-9' and trx[0].get('vendor') == 'PT Baru')
        step('L2-14 transaksi MASUK tersimpan (payload benar)',
             lambda: expect(ok, json.dumps(trx, ensure_ascii=False)[:300]))
        page.screenshot(path=SHOT + r'\l2_trx_masuk.png')

        # 7. Offline: KELUAR -> outbox pending -> online -> flush
        page.click('#tab-scanner')          # FAB Transaksi -> reset ke step input
        page.wait_for_selector('#scan-id-input', state='visible', timeout=8000)
        page.fill('#scan-id-input', 'BRG-002')
        page.click('#btn-lookup')
        page.wait_for_selector('#btn-keluar', state='visible', timeout=10000)
        page.click('#btn-keluar')
        page.fill('#qty-input', '1')
        page.fill('#rak-input', 'B-02')
        ctx.set_offline(True)   # putus setelah item & form siap, sebelum simpan
        STATE['offline'] = True
        page.click('#btn-submit')
        page.wait_for_function(
            "((document.getElementById('sbar-submit')||{}).textContent||'').includes('belum dapat dipastikan')",
            timeout=10000)
        step('L2-15 offline: pesan "belum dapat dipastikan" (tidak minta input ulang)', None)
        pend = page.evaluate("JSON.parse(localStorage.getItem('rdi_trx_outbox')||'[]').length")
        step('L2-16 outbox berisi 1 transaksi tertunda',
             lambda: expect(pend == 1, 'outbox=' + str(pend)))
        page.screenshot(path=SHOT + r'\l2_offline_outbox.png')
        n_before = len(posted)
        ctx.set_offline(False)
        STATE['offline'] = False
        try:
            page.wait_for_function(
                "JSON.parse(localStorage.getItem('rdi_trx_outbox')||'[]').length === 0", timeout=8000)
            step('L2-17 online lagi: outbox terkirim (flush otomatis)', None)
        except Exception:
            page.evaluate("window.flushOutbox && window.flushOutbox()")
            page.wait_for_function(
                "JSON.parse(localStorage.getItem('rdi_trx_outbox')||'[]').length === 0", timeout=8000)
            step('L2-17 online lagi: outbox terkirim (flush manual)', None)
        keluar = [x for x in posted[n_before:] if x.get('jenis') == 'KELUAR']
        step('L2-18 flush mengirim ulang KELUAR (retry outbox jalan)',
             lambda: expect(len(keluar) >= 1 and bool(keluar[0].get('requestId')),
                            'posted baru=' + json.dumps(keluar)[:200]))

        # 8. Tab Rak: daftar rak + detail rak
        page.click('#tab-more')
        page.locator('#section-more button', has_text='Cek Per Rak').first.click()
        page.wait_for_function("document.body.textContent.includes('A-01')", timeout=10000)
        page.locator('#rak-list-container').get_by_text('A-01', exact=True).first.click()
        page.wait_for_function("document.body.textContent.includes('Akrilik')", timeout=10000)
        step('L2-19 cek per rak: A-01 memuat item Akrilik', None)

        # 9. Tab Alert: item di bawah min stok
        page.click('#tab-more')
        page.locator('#section-more button', has_text='Alert Stok').first.click()
        page.wait_for_function("document.body.textContent.includes('Bearing 6204')", timeout=10000)
        step('L2-20 alert stok min: Bearing 6204 tampil', None)

        # 10. Dashboard: fallback lokal jalan tanpa crash
        page.click('#tab-dashboard')
        page.wait_for_timeout(1200)
        step('L2-21 dashboard terbuka (fallback lokal, tanpa crash)', None)
        page.screenshot(path=SHOT + r'\l2_dashboard.png')

        # 11. History feed: baris PINDAH berbadge "Pindah Rak"
        page.click('#tab-history')
        page.click('#btn-hist-feed-refresh')
        page.wait_for_function("document.body.textContent.includes('PINDAH DARI: A-01')", timeout=10000)
        badge = page.evaluate("document.body.textContent.includes('Pindah Rak')")
        step('L2-22 riwayat: baris PINDAH tampil + badge Pindah Rak',
             lambda: expect(badge, 'badge Pindah Rak tidak ada'))
        page.screenshot(path=SHOT + r'\l2_history_feed.png')

        # 12. Lookup riwayat per item
        page.fill('#hist-id-input', 'BRG-002')
        page.click('#btn-hist-lookup')
        page.wait_for_function("document.body.textContent.includes('maintenance')", timeout=10000)
        step('L2-23 lookup riwayat item: entri "maintenance" tampil', None)

        # 13. Ganti Operator -> caption/topbar ikut
        page.click('#tab-more')
        page.locator('#section-more button', has_text='Ganti Operator').first.click()
        page.wait_for_selector('#modal-user.show', timeout=8000)
        page.fill('#user-name-input', 'Budi')
        page.select_option('#user-dept-input', 'Produksi')
        page.locator('#modal-user button', has_text='Simpan').first.click()
        page.wait_for_function(
            "((document.getElementById('sheet-version-label')||{}).textContent||'').includes('Operator: Budi')",
            timeout=8000)
        tb = page.text_content('#topbar-username') or ''
        step('L2-24 ganti operator -> caption & topbar jadi "Budi"',
             lambda: expect(tb.strip() == 'Budi', 'topbar=' + tb))

        # 14. Tambah item baru
        page.click('#tab-master')
        page.click('#btn-add-item')
        page.wait_for_selector('#add-sheet.show', timeout=8000)
        page.fill('#add-nama', 'Filter Udara F20')
        page.fill('#add-qty', '4')
        page.fill('#add-unit', 'Pcs')
        page.fill('#add-rak', 'E-01')
        page.click('#btn-save-add')
        page.wait_for_timeout(2000)
        adds = [x for x in allreq if x.get('action') == 'addItem'
                and (x.get('nama') or '') == 'Filter Udara F20']
        step('L2-25 tambah item baru: payload addItem benar (rak E-01, qty 4)',
             lambda: expect(len(adds) == 1 and adds[0].get('rak') == 'E-01',
                            json.dumps(adds, ensure_ascii=False)[:300]))

        # 15. Cetak: daftar item kartu
        page.click('#tab-more')
        page.locator('#section-more button', has_text='Cetak Kartu').first.click()
        page.wait_for_function("document.body.textContent.includes('Akrilik 3mm')", timeout=10000)
        step('L2-26 tab cetak: daftar item siap pilih', None)
        page.screenshot(path=SHOT + r'\l2_cetak.png')

        ctx.close()

        # ===== Konteks B: viewer (tanpa editor key) =====
        ctx2 = browser.new_context(viewport={'width': 390, 'height': 844},
                                   locale='id-ID', timezone_id='Asia/Jakarta')
        ctx2.route('**/mock.gas/**', handle_gas)
        ctx2.add_init_script("localStorage.setItem('rdi_gas_url','https://mock.gas/exec');")
        p2 = ctx2.new_page()
        p2.on('dialog', lambda d: d.accept())
        p2.goto(BASE + '/index.html', wait_until='domcontentloaded')
        p2.wait_for_selector('#login-gate:not(.hide)', state='visible', timeout=20000)
        step('L2-27 tanpa sesi: login gate tampil', None)
        p2.fill('#login-username', 'wahyu')
        p2.fill('#login-password', 'rahasia')
        p2.click('#login-submit-btn')
        p2.wait_for_function("document.getElementById('login-gate').classList.contains('hide')", timeout=20000)
        p2.wait_for_function("document.body.classList.contains('viewer-mode')", timeout=15000)
        step('L2-28 login viewer sukses -> mode lihat-saja aktif', None)
        vb = p2.evaluate(
            "(() => { const e = document.querySelector('.viewer-badge');"
            " return e ? getComputedStyle(e).display !== 'none' : false; })()")
        step('L2-29 badge "LIHAT SAJA" terlihat',
             lambda: expect(vb, 'badge display none'))
        p2.click('#tab-more')
        p2.wait_for_function(
            "((document.getElementById('sheet-version-label')||{}).textContent||'').includes('Operator: Wahyu Viewer')",
            timeout=8000)
        step('L2-30 caption versi menampilkan operator hasil login (res.nama)', None)
        p2.screenshot(path=SHOT + r'\l2_viewer_mode.png')
        ctx2.close()
        browser.close()
        httpd.shutdown()

    fails = [r for r in results if r[0] == 'FAIL']
    print('---')
    print('L2 E2E: %d PASS / %d FAIL' % (len(results) - len(fails), len(fails)))
    for f in fails:
        print('FAIL |', f[1])
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
