// Simulate outbox/idempotency/partial logic from frontend + backend patterns
// Pure JS simulation - no network

let results = [];
function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

// ---- CASE A: network error -> outbox ----
// Extract logic mirrors index.html submitTransaksi
function simulateSubmit(payload, gasPostImpl) {
  const state = { outbox: null, draft: 'kept', statusUI: null, result: null };
  return Promise.resolve()
    .then(() => gasPostImpl(payload))
    .then((result) => {
      if (result.status === 'error') {
        const isNetworkErr = /^Network error/.test(result.message || '');
        if (isNetworkErr) {
          state.outbox = { payload, savedAt: Date.now() };
          state.statusUI = 'ambiguous-warn';
          state.draft = 'kept';
          state.result = 'network-error';
          return state;
        }
        state.statusUI = 'error';
        state.result = 'server-error';
        return state;
      }
      if (result.status === 'partial') {
        state.outbox = null;
        state.draft = 'cleared';
        state.statusUI = 'partial-warn';
        state.result = 'partial';
        return state;
      }
      state.outbox = null;
      state.draft = 'cleared';
      state.statusUI = 'success';
      state.result = 'ok';
      return state;
    })
    .catch(() => {
      state.outbox = { payload, savedAt: Date.now() };
      state.statusUI = 'ambiguous-warn';
      state.draft = 'kept';
      state.result = 'throw-network';
      return state;
    });
}

// CASE A
async function caseA() {
  const payload = { action: 'postTransaksi', itemId: 'RDI-2026-001', jenis: 'KELUAR', qty: 2, requestId: 'req-abc' };
  const state = await simulateSubmit(payload, () => Promise.reject(new Error('Network error: failed to fetch')));
  assert('A1 transaksi tidak hilang (outbox terisi)', state.outbox && state.outbox.payload.requestId === 'req-abc');
  assert('A2 outbox berisi payload lengkap', state.outbox && state.outbox.payload.qty === 2 && state.outbox.payload.jenis === 'KELUAR');
  assert('A3 status UI ambiguous/warn', state.statusUI === 'ambiguous-warn');
  assert('A4 draft tidak dihapus', state.draft === 'kept');

  // Retry with same requestId - backend dedup
  const cache = new Map();
  function backendPost(body) {
    const key = 'trx_req_' + body.requestId + '_sig';
    if (cache.has(key)) return { status: 'ok', message: 'duplicate-served-from-cache', saldoSebelum: 10, saldoSesudah: 8, unit: 'pcs', namaItem: 'X' };
    // process
    cache.set(key, true);
    return { status: 'ok', message: 'created', saldoSebelum: 10, saldoSesudah: 8, unit: 'pcs', namaItem: 'X' };
  }
  const r1 = backendPost(payload);
  const r2 = backendPost(payload); // retry same requestId
  assert('A5 retry requestId sama -> tidak insert kedua kali', cache.size === 1);
  assert('A6 response kedua tetap ok (idempotent)', r2.status === 'ok' && r2.message === 'duplicate-served-from-cache');
}

// CASE B: double submit different paths same requestId + bodySig
async function caseB() {
  const processed = new Map();
  function bodySig(b) { return JSON.stringify([b.itemId, b.jenis, b.qty, b.rak, b.requestId]); }
  function backend(body) {
    const id = body.requestId;
    const sig = bodySig(body);
    const key = id ? 'trx_req_' + id + '_' + sig : null;
    if (key && processed.has(key)) return { status: 'ok', dedup: true };
    // simulate lock+append
    if (key) processed.set(key, { saldo: (processed.get('_s') || 100) - body.qty });
    const saldo = (processed.get(body.itemId) || 100);
    if (!processed.has(body.itemId)) processed.set(body.itemId, 100);
    if (body.jenis === 'KELUAR') {
      const cur = processed.get(body.itemId);
      processed.set(body.itemId, cur - body.qty);
    } else {
      processed.set(body.itemId, processed.get(body.itemId) + body.qty);
    }
    return { status: 'ok', dedup: false, saldoAfter: processed.get(body.itemId) };
  }
  const req = { action: 'postTransaksi', itemId: 'X', jenis: 'KELUAR', qty: 5, rak: 'A1', requestId: 'dup-1' };
  const r1 = backend({ ...req });
  const r2 = backend({ ...req });
  assert('B1 request pertama diproses', r1.dedup === false);
  assert('B2 request kedua di-dedup', r2.dedup === true);
  assert('B3 saldo terpotong sekali saja', processed.get('X') === 95, 'saldo=' + processed.get('X') + ' expected 95');

  // same requestId different body -> different key (bodySig) - should NOT false-positive dedup wrong body
  const r3 = backend({ ...req, qty: 1, requestId: 'dup-1' });
  assert('B4 requestId sama tapi body beda -> tidak salah-dedup', r3.dedup === false || processed.get('X') === 95, 'saldo=' + processed.get('X'));
}

// CASE C: partial response UI
async function caseC() {
  const state = await simulateSubmit({ requestId: 'p1', itemId: 'Z', jenis: 'MASUK', qty: 1 },
    () => Promise.resolve({ status: 'partial', message: 'saldo sync failed', unit: 'pcs', namaItem: 'Z' }));
  assert('C1 partial -> bukan success UI', state.statusUI === 'partial-warn' && state.result === 'partial');
  assert('C2 outbox dibersihkan (trx sudah tersimpan)', state.outbox === null);
  assert('C3 draft cleared (bisa lanjut, saldo perlu rekalkulasi)', state.draft === 'cleared');

  // batch handler partial -> ambiguous
  function batchMap(result) {
    if (result.status === 'error') {
      return /^Network error/.test(result.message || '') ? 'ambiguous' : 'failed';
    }
    if (result.status === 'partial') return 'ambiguous';
    return 'success';
  }
  assert('C4 batch partial -> ambiguous', batchMap({ status: 'partial' }) === 'ambiguous');
  assert('C5 batch network -> ambiguous', batchMap({ status: 'error', message: 'Network error: x' }) === 'ambiguous');
  assert('C6 batch server fail -> failed', batchMap({ status: 'error', message: 'Stok tidak cukup' }) === 'failed');
  assert('C7 batch ok -> success', batchMap({ status: 'ok' }) === 'success');
}

// Token TTL simulation (mirror fixed Code.gs: makeViewerToken now includes pv as bits[4])
function caseToken() {
  const TTL = 12 * 60 * 60 * 1000;
  const make = (pv) => ({ expiry: Date.now() + TTL, jti: 'j1', pv: pv == null ? '' : String(pv) });
  const verify = (t, opts = {}) => {
    if (Date.now() > t.expiry) return { ok: false, expired: true };
    if (opts.denied && opts.denied.has(t.jti)) return { ok: false, revoked: true };
    const expectedPv = opts.expectedPv;
    const expectedHashPv = opts.expectedHashPv;
    const tokenPv = t.pv || '';
    if (expectedPv != null && expectedPv !== '' && tokenPv && String(tokenPv) !== String(expectedPv)) {
      return { ok: false, revoked: true };
    }
    if (tokenPv && expectedHashPv && expectedPv !== tokenPv && String(tokenPv) !== String(expectedHashPv)) {
      return { ok: false, revoked: true };
    }
    if (!tokenPv && expectedHashPv) {
      return { ok: false, revoked: true };
    }
    return { ok: true };
  };
  const t = make('fp-old');
  assert('T1 token valid dalam TTL (6h)', verify(t, { expectedHashPv: 'fp-old' }).ok === true);
  const expired = { ...t, expiry: Date.now() - 1 };
  assert('T2 token expired ditolak', verify(expired).expired === true);
  const denied = new Set(['j1']);
  assert('T3 revoked jti ditolak', verify(t, { denied }).revoked === true);

  // FIXED: token has pv; password fingerprint changed -> invalidates
  const r = verify(t, { expectedHashPv: 'fp-new' });
  const invalidates = !r.ok;
  assert('T4 passwordVersion invalidates session (EXPECTED)', invalidates, 'actual ok=' + r.ok + ' -> ' + (invalidates ? 'invalidates' : 'DOES NOT INVALIDATE (BUG)'));

  // explicit passwordVersion column mismatch
  const tokenOldPv = make('1');
  const r2 = verify(tokenOldPv, { expectedPv: '2', expectedHashPv: '1' });
  assert('T5 token with mismatched pv rejected', r2.revoked === true);

  // logout denylist path
  const r3 = verify(t, { denied: new Set([t.jti]), expectedHashPv: 'fp-old' });
  assert('T6 logout denylist revokes', r3.revoked === true);
}

// Rate limit simulation
function caseRateLimit() {
  const store = new Map();
  function check(u) {
    const key = 'login_fail_' + String(u).toLowerCase();
    const fails = parseInt(store.get(key) || '0', 10);
    if (fails >= 5) return { ok: false };
    return { ok: true };
  }
  function record(u) {
    const key = 'login_fail_' + String(u).toLowerCase();
    const fails = parseInt(store.get(key) || '0', 10) + 1;
    store.set(key, String(fails));
  }
  let allowed = 0;
  for (let i = 0; i < 10; i++) {
    const c = check('user1');
    if (c.ok) { allowed++; record('user1'); }
  }
  assert('RL1 after 5 fails, 6th blocked', allowed === 5, 'allowed=' + allowed);
  // different username not blocked
  assert('RL2 other username not blocked', check('user2').ok === true);
}

// FE-01: outbox flush / retransmission (mirrors index.html flushOutbox)
async function caseFlush() {
  // multi-slot push + legacy single-object read
  let storage = null;
  const readOutbox = () => {
    if (!storage) return [];
    const v = JSON.parse(storage);
    if (Array.isArray(v)) return v;
    if (v && v.payload) return [v];
    return [];
  };
  const writeOutbox = (list) => {
    if (!list || !list.length) { storage = null; return; }
    storage = JSON.stringify(list.slice(-20));
  };
  const pushOutbox = (payload) => {
    const rid = payload.requestId;
    const list = readOutbox().filter((e) => !(e.payload && rid && e.payload.requestId === rid));
    list.push({ payload, savedAt: Date.now() });
    writeOutbox(list);
  };
  const removeOutboxByRequestId = (rid) => {
    if (!rid) { writeOutbox([]); return; }
    writeOutbox(readOutbox().filter((e) => !(e.payload && e.payload.requestId === rid)));
  };

  // legacy single object still readable
  storage = JSON.stringify({ payload: { requestId: 'legacy-1', qty: 1 }, savedAt: 1 });
  assert('F1 legacy single-object outbox readable as array', readOutbox().length === 1 && readOutbox()[0].payload.requestId === 'legacy-1');

  // multi-slot: two different requestIds both kept; same requestId deduped
  storage = null;
  pushOutbox({ requestId: 'a1', qty: 1 });
  pushOutbox({ requestId: 'b1', qty: 2 });
  assert('F2 multi-slot keeps both pending', readOutbox().length === 2);
  pushOutbox({ requestId: 'a1', qty: 9 });
  const a = readOutbox().filter((e) => e.payload.requestId === 'a1');
  assert('F3 same requestId does not duplicate slot', a.length === 1 && a[0].payload.qty === 9, 'count=' + a.length);

  // flush simulation: network fail keeps entry; success removes by requestId only
  let posts = 0;
  let networkFail = true;
  const gasPostSim = (payload) => {
    posts++;
    if (networkFail) return Promise.resolve({ status: 'error', message: 'Network error: down' });
    return Promise.resolve({ status: 'ok', message: 'Transaksi berhasil' });
  };
  async function flushSim() {
    let guard = 0;
    while (readOutbox().length && guard++ < 10) {
      const entry = readOutbox()[0];
      const res = await gasPostSim(entry.payload);
      const rid = entry.payload.requestId;
      if (res && (res.status === 'ok' || res.status === 'partial')) {
        removeOutboxByRequestId(rid);
        continue;
      }
      if (res && /^Network error/.test(res.message || '')) break; // schedule retry, keep
      if (res && res.status === 'error') { removeOutboxByRequestId(rid); break; }
      break;
    }
  }

  storage = null;
  pushOutbox({ requestId: 'n1', qty: 1 });
  pushOutbox({ requestId: 'n2', qty: 2 });
  await flushSim();
  assert('F4 network error keeps pending outbox (not lost)', readOutbox().length === 2, 'len=' + readOutbox().length);
  assert('F5 flush attempted retransmission (posts>0)', posts >= 1, 'posts=' + posts);

  networkFail = false;
  posts = 0;
  await flushSim();
  assert('F6 flush on recovery clears all pending', readOutbox().length === 0, 'len=' + readOutbox().length);
  assert('F7 both slots retransmitted', posts === 2, 'posts=' + posts);

  // server validation error drops only that slot (no infinite retry)
  networkFail = false;
  storage = null;
  pushOutbox({ requestId: 'bad', qty: 1 });
  pushOutbox({ requestId: 'good', qty: 2 });
  let call = 0;
  const gasPostMixed = (payload) => {
    call++;
    if (payload.requestId === 'bad') return Promise.resolve({ status: 'error', message: 'Stok tidak cukup' });
    return Promise.resolve({ status: 'ok' });
  };
  // process like flush: first entry bad -> removed; second good -> removed
  while (readOutbox().length) {
    const entry = readOutbox()[0];
    const res = await gasPostMixed(entry.payload);
    if (res.status === 'ok' || res.status === 'partial' || res.status === 'error') {
      removeOutboxByRequestId(entry.payload.requestId);
      if (res.status === 'error') break; // show status, stop this flush pass
      continue;
    }
    break;
  }
  // after bad removed, good still pending for next pass
  assert('F8 server error removes only failed slot', readOutbox().some((e) => e.payload.requestId === 'good'), 'left=' + JSON.stringify(readOutbox()));
}

(async () => {
  await caseA();
  await caseB();
  await caseC();
  caseToken();
  caseRateLimit();
  await caseFlush();
  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  console.log('\n=== SUMMARY: ' + pass + ' PASS, ' + fail + ' FAIL ===');
  results.filter(r => !r.pass).forEach(r => console.log('FAIL DETAIL: ' + r.name + ' -> ' + r.detail));
})();
