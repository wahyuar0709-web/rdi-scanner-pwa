// QR decoder logic test: generate QR image, decode with local jsQR (no camera)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
const jsQRCode = fs.readFileSync(path.join(ROOT, 'jsQR.min.js'), 'utf8');

// Minimal QR matrix via qrcode algorithm — use a pure-JS QR encoder if available,
// else render using canvas-free approach: implement a tiny known QR payload test
// with 'qrcode' package if present; otherwise generate PNG via external tool.

let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (ev || '')); }
}

// Load jsQR in a sandbox
const vm = require('vm');
const sandbox = { console, Math, Date, Uint8ClampedArray, Uint8Array, Int32Array, Float64Array, Array, Object, String, Number, Boolean, Error, TypeError, JSON, performance: { now: () => Date.now() } };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(jsQRCode, sandbox, { filename: 'jsQR.min.js' });
} catch (e) {
  console.log('FAIL | load jsQR | ' + e.message);
  process.exit(1);
}
const jsQR = sandbox.jsQR || sandbox.window.jsQR;
t('jsQR loads from local file', typeof jsQR === 'function', typeof jsQR);

// Try to generate QR with pure JS implementation embedded (minimal Reed-Solomon QR)
// Use node canvas? may not exist. Use a precomputed QR for "RDI-2026-001" via
// generating with a small inline QR encoder (byte mode, version 2-3, EC L).

function qrEncode(text) {
  // Use dynamic import of any available encoder
  try {
    const { createRequire } = require('module');
    // try common packages without installing
    for (const name of ['qrcode', 'qr-image', 'nayuki-qr-code']) {
      try {
        const req = createRequire(path.join(ROOT, 'package.json'));
        return { lib: name, mod: req(name) };
      } catch (e) {}
    }
  } catch (e) {}
  // try require from temp
  try { return { lib: 'qrcode', mod: require('qrcode') }; } catch (e) {}
  try { return { lib: 'qrcode-generator', mod: require('qrcode-generator') }; } catch (e) {}
  return null;
}

// Alternative: paint QR modules from a known-good hard-coded QR for simple text using
// online algorithm — implement enough of QR for alphanumeric short string.

// Use Chrome to render QR via a tiny page? Heavy. Instead: decode path test with
// synthetic finder-pattern image is unreliable.
// Best laptop approach: implement QR encoder using the well-known compact algorithm
// for versions that fit "RDI-2026-001" (13 chars) — version 1-L byte mode possible? 1-L = 17 bytes.

function encodeQRByte(text) {
  // Very small QR encoder (version determined), mask 0, EC level L — based on public domain port logic
  // To avoid bugs, use pre-built matrices from a known generator written carefully.
  const data = Array.from(Buffer.from(text, 'utf8'));
  // Choose version: v1-L capacity byte=17, v2-L=32, v3-L=53
  let version, totalDataCodewords, ecCodewordsPerBlock, blocks;
  if (data.length <= 17) { version = 1; totalDataCodewords = 19; ecCodewordsPerBlock = 7; blocks = 1; }
  else if (data.length <= 32) { version = 2; totalDataCodewords = 34; ecCodewordsPerBlock = 10; blocks = 1; }
  else { version = 3; totalDataCodewords = 55; ecCodewordsPerBlock = 15; blocks = 1; }

  // Bit buffer
  const bits = [];
  function put(val, len) { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
  put(4, 4); // byte mode
  put(data.length, 8); // count for v1-9
  for (const b of data) put(b, 8);
  // terminator
  const capacityBits = totalDataCodewords * 8;
  const term = Math.min(4, capacityBits - bits.length);
  put(0, term);
  while (bits.length % 8) bits.push(0);
  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataCw.push(v);
  }
  const pad = [0xEC, 0x11];
  let pi = 0;
  while (dataCw.length < totalDataCodewords) dataCw.push(pad[pi++ % 2]);

  // Reed-Solomon
  function rsGen(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gfMul(g[j], gfPow(2, i));
      }
      g = ng;
    }
    return g;
  }
  function gfMul(a, b) {
    let r = 0;
    while (b) { if (b & 1) r ^= a; b >>= 1; a = (a << 1) ^ ((a & 0x80) ? 0x11d : 0); }
    return r & 0xff;
  }
  function gfPow(a, n) { let r = 1; for (let i = 0; i < n; i++) r = gfMul(r, a); return r; }
  function rsEncode(msg, ecLen) {
    const gen = rsGen(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const b of msg) {
      const factor = b ^ res[0];
      res.shift(); res.push(0);
      if (factor) for (let i = 0; i < gen.length - 1; i++) res[i] ^= gfMul(gen[i + 1], factor);
    }
    // fix: standard polynomial division
    return res;
  }
  // Correct RS encoder:
  function rsEncode2(data, ecLen) {
    const gen = rsGen(ecLen);
    const buf = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const coef = buf[i];
      if (coef !== 0) {
        for (let j = 1; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coef);
      }
    }
    return buf.slice(data.length);
  }
  const ec = rsEncode2(dataCw, ecCodewordsPerBlock);
  const all = dataCw.concat(ec);

  // Build matrix
  const size = version * 4 + 17;
  const mod = [];
  for (let i = 0; i < size; i++) mod.push(new Array(size).fill(null));

  function placeFinder(r, c) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
        (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
        (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
      mod[rr][cc] = on ? 1 : 0;
    }
  }
  placeFinder(0, 0); placeFinder(0, size - 7); placeFinder(size - 7, 0);

  // timing
  for (let i = 8; i < size - 8; i++) {
    if (mod[6][i] === null) mod[6][i] = i % 2 === 0 ? 1 : 0;
    if (mod[i][6] === null) mod[i][6] = i % 2 === 0 ? 1 : 0;
  }
  // alignment for v2+
  if (version >= 2) {
    const centers = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] }[version];
    const ps = [centers[1]];
    for (const pr of ps) for (const pc of ps) {
      if (mod[pr][pc] !== null) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = pr + dr, cc = pc + dc;
        mod[rr][cc] = (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) ? 1 : 0;
      }
    }
  }
  // dark module
  mod[size - 8][8] = 1;

  // reserve format areas
  function reserveFormat() {
    for (let i = 0; i < 9; i++) {
      if (mod[8][i] === null) mod[8][i] = 0;
      if (mod[i][8] === null) mod[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
      if (mod[8][size - 1 - i] === null) mod[8][size - 1 - i] = 0;
      if (mod[size - 1 - i][8] === null) mod[size - 1 - i][8] = 0;
    }
  }
  reserveFormat();
  // version info v7+ only — skip for v1-3

  // place data with mask 0 (i+j)%2==0 inverted later — standard zigzag
  const dataBits = [];
  for (const cw of all) for (let i = 7; i >= 0; i--) dataBits.push((cw >> i) & 1);

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip timing col
    for (let n = 0; n < size; n++) {
      const row = upward ? size - 1 - n : n;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (mod[row][c] !== null) continue;
        let bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
        // mask 0
        if ((row + c) % 2 === 0) bit ^= 1;
        mod[row][c] = bit;
      }
    }
    upward = !upward;
  }

  // Format info for EC L (01) + mask 0 (000) = 01000 -> BCH
  // Precomputed format strings for L, masks 0-7:
  const formatL = ['111011111000100', '111001011110011', '111110110101010', '111100010011101',
    '110011000101111', '110001100011000', '110110001000001', '110100101110110'];
  const fmt = formatL[0];
  const fmtBits = fmt.split('').map(x => +x);
  // place format
  for (let i = 0; i < 15; i++) {
    const bit = fmtBits[i];
    // horizontal near top-left / top-right and vertical
    if (i < 6) mod[8][i] = bit;
    else if (i === 6) mod[8][7] = bit;
    else if (i === 7) mod[8][8] = bit;
    else if (i === 8) mod[7][8] = bit;
    else mod[14 - i][8] = bit;

    if (i < 8) mod[8][size - 1 - i] = bit;
    else mod[size - 15 + i][8] = bit;
  }
  mod[size - 8][8] = 1;

  return { size, mod, version };
}

function modToRGBA(qr, scale, quiet) {
  const dim = (qr.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.mod[r][c]) continue;
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
        const py = (r + quiet) * scale + y;
        const px = (c + quiet) * scale + x;
        const o = (py * dim + px) * 4;
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0;
      }
    }
  }
  return { data, width: dim, height: dim };
}

const sample = 'RDI-2026-001';
try {
  const qr = encodeQRByte(sample);
  t('QR encoder produced matrix', !!qr && qr.size > 20, qr && `v${qr.version} size=${qr.size}`);
  const img = modToRGBA(qr, 8, 4);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  t('jsQR decodes generated QR -> value', !!code && code.data === sample, code ? `got=${code.data}` : 'null');
  if (code) {
    // application handler path: raw.split('|')[0].trim().toUpperCase()
    const raw = code.data.trim();
    const id = raw.split('|')[0].trim().toUpperCase();
    t('Application QR parse (split | toUpperCase)', id === sample.toUpperCase(), id);
  }

  // pipe payload like app
  const sample2 = 'T-99|batch';
  const qr2 = encodeQRByte(sample2);
  const img2 = modToRGBA(qr2, 8, 4);
  const code2 = jsQR(img2.data, img2.width, img2.height, { inversionAttempts: 'dontInvert' });
  t('jsQR decodes pipe payload', !!code2 && code2.data === sample2, code2 && code2.data);
  if (code2) {
    const id2 = code2.data.trim().split('|')[0].trim().toUpperCase();
    t('Pipe payload id extraction', id2 === 'T-99', id2);
  }
} catch (e) {
  t('QR pipeline', false, e.stack || e.message);
}

// scanner.html sendResult structural already in browser suite
console.log('---');
console.log(pass + ' PASS / ' + fail + ' FAIL');
console.log('REAL CAMERA: DEVICE-DEPENDENT / NOT TESTED');
process.exit(fail ? 1 : 0);
