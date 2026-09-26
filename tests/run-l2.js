#!/usr/bin/env node
/**
 * RDI L2 runner — sequential browser/CDP suites in tests/l2/
 * Level: L2 only. Requires Chrome. Exit 0 if no FAIL; exit 1 otherwise.
 * Run suites one at a time (no parallel Chrome/CDP).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const L2_DIR = path.join(__dirname, 'l2');
const RESULTS_DIR = path.join(__dirname, 'results');
const ROOT = path.resolve(__dirname, '..');
const SUITE_TIMEOUT_MS = 300000; // browser suite butuh ~210-240s (SW/offline/camera waits); cap 180s membunuh suite sebelum selesai

// CDP/HTTP port yang dipakai suite L2. WAJIB di-update setiap menambah/mengganti port suite
// (sumber: tiap file tests/l2/*.js). Dipakai untuk membersihkan sisa proses test SAJA —
// TIDAK boleh memakai "Get-Process chrome" global karena akan menutup Chrome milik user.
const TEST_CDP_PORTS = [8781, 8782, 9337, 9338, 9371, 9372, 9373, 9374, 9375, 9376, 9423, 9424, 9425, 9426, 9430, 9431, 9432, 9433];

function killTestChrome() {
  // Hanya chrome yang punya --remote-debugging-port milik test L2.
  try {
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$ports = @(${TEST_CDP_PORTS.join(',')})` +
          `; $procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue` +
          `; foreach ($p in $procs) { $cl = $p.CommandLine; if (-not $cl) { continue }` +
          `  foreach ($port in $ports) { if ($cl -match "--remote-debugging-port=$port") { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; break } } }`,
      ],
      { timeout: 15000, stdio: 'ignore' }
    );
  } catch (_) {}
}

function ensureResults() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function listSuites() {
  if (!fs.existsSync(L2_DIR)) return [];
  return fs
    .readdirSync(L2_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => path.join(L2_DIR, f));
}

function killL2Ports() {
  const ports = [8781, 8782, 9338];
  for (const port of ports) {
    try {
      spawnSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
        ],
        { timeout: 8000, stdio: 'ignore' }
      );
    } catch (_) {}
  }
}

function countStatuses(output) {
  const counts = { PASS: 0, FAIL: 0, OTHER: 0 };
  for (const line of output.split(/\r?\n/)) {
    if (/^===\s/.test(line) || /PASS \/ \d+ FAIL/.test(line)) continue;
    if (/^PASS\b/.test(line)) counts.PASS++;
    else if (/^FAIL\b/.test(line)) counts.FAIL++;
    else if (
      /^(NOT TESTED|ENVIRONMENT-DEPENDENT|DEVICE-DEPENDENT|UNVERIFIED|ACCEPTED LIMITATION|STRUCTURAL)\b/.test(
        line
      )
    )
      counts.OTHER++;
  }
  return counts;
}

function runSuite(file) {
  const name = path.basename(file);
  const started = Date.now();
  killL2Ports();
  killTestChrome();
  const res = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: SUITE_TIMEOUT_MS,
    env: { ...process.env, RDI_TEST_ROOT: ROOT, RDI_TEST_LEVEL: 'L2' },
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const output = stdout + (stderr ? '\n' + stderr : '');
  // hitung dari stdout+stderr: assertion yang tercetak ke stderr ikut dihitung
  const counts = countStatuses(output);
  // ASSERTION FLOOR: suite tanpa assertion (mis. Chrome/CDP gagal start) = TIDAK boleh hijau
  const allowZero = process.env.RDI_ALLOW_ZERO_ASSERT === '1';
  const noAssert = counts.PASS === 0;
  const ok = res.status === 0 && counts.FAIL === 0 && (counts.PASS > 0 || allowZero);
  killL2Ports();
  killTestChrome();
  return {
    suite: name,
    ok,
    noAssert: noAssert && !allowZero,
    timedOut: !!(res.error && res.error.code === 'ETIMEDOUT'),
    exitCode: res.status,
    counts,
    durationMs: Date.now() - started,
    tail: output.split(/\r?\n/).filter(Boolean).slice(-20),
  };
}

function main() {
  ensureResults();
  const suites = listSuites();
  if (suites.length === 0) {
    console.error('FAIL | no suites in tests/l2');
    process.exit(1);
  }

  console.log('RDI L2 runner — ' + suites.length + ' suite(s) | root=' + ROOT);
  console.log('Level L2 (browser/CDP). Sequential. Chrome required.');
  console.log('---');

  const results = [];
  let totalPass = 0;
  let totalFail = 0;
  let suitesFailed = 0;

  for (const file of suites) {
    process.stdout.write('RUN  | ' + path.basename(file) + ' ... ');
    const r = runSuite(file);
    results.push(r);
    totalPass += r.counts.PASS;
    totalFail += r.counts.FAIL;
    if (!r.ok) {
      suitesFailed++;
      if (r.noAssert) console.log('FAIL (NO ASSERTIONS EXECUTED, exit=' + r.exitCode + ')');
      else if (r.timedOut) console.log('FAIL (TIMEOUT, exit=' + r.exitCode + ')');
      else console.log(
        'FAIL (' + r.counts.PASS + 'P/' + r.counts.FAIL + 'F, exit=' + r.exitCode + ')'
      );
      for (const line of r.tail) console.log('       ' + line);
    } else {
      console.log(
        'ok (' + r.counts.PASS + 'P/' + r.counts.FAIL + 'F, ' + r.durationMs + 'ms)'
      );
    }
  }

  const summary = {
    level: 'L2',
    root: ROOT,
    date: new Date().toISOString(),
    suites: results.length,
    suitesFailed,
    assertionsPass: totalPass,
    assertionsFail: totalFail,
    ok: suitesFailed === 0 && totalFail === 0,
    results,
  };

  const outPath = path.join(RESULTS_DIR, 'l2_' + Date.now() + '.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  const latestPath = path.join(RESULTS_DIR, 'l2_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2));

  console.log('---');
  console.log(
    (summary.ok ? 'L2 PASS' : 'L2 FAIL') +
      ' | suites=' +
      results.length +
      ' failedSuites=' +
      suitesFailed +
      ' assertPass=' +
      totalPass +
      ' assertFail=' +
      totalFail
  );
  console.log('results: ' + latestPath);
  process.exit(summary.ok ? 0 : 1);
}

main();
