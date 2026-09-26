#!/usr/bin/env node
/**
 * RDI L1 runner — sequential static/simulation suites in tests/l1/
 * Level: L1 only. Exit 0 if no FAIL lines; exit 1 otherwise.
 * Statuses honored: PASS | FAIL | NOT TESTED (other tokens logged, not fail).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const L1_DIR = path.join(__dirname, 'l1');
const RESULTS_DIR = path.join(__dirname, 'results');
const ROOT = path.resolve(__dirname, '..');

function ensureResults() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function listSuites() {
  if (!fs.existsSync(L1_DIR)) return [];
  return fs
    .readdirSync(L1_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => path.join(L1_DIR, f));
}

function countStatuses(output) {
  const counts = { PASS: 0, FAIL: 0, OTHER: 0 };
  for (const line of output.split(/\r?\n/)) {
    // abaikan baris ringkasan suite (mis. "PASS | ui06a_focus_sbar | pass=25 fail=0")
    if (/^PASS \| [^|]+ \| pass=\d+ fail=\d+/.test(line)) continue;
    if (/^PASS\b/.test(line)) counts.PASS++;
    else if (/^FAIL\b/.test(line)) counts.FAIL++;
    else if (/^(NOT TESTED|ENVIRONMENT-DEPENDENT|DEVICE-DEPENDENT|UNVERIFIED|ACCEPTED LIMITATION)\b/.test(line))
      counts.OTHER++;
  }
  return counts;
}

function runSuite(file) {
  const name = path.basename(file);
  const started = Date.now();
  const res = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, RDI_TEST_ROOT: ROOT },
  });
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const output = stdout + (stderr ? '\n' + stderr : '');
  // hitung dari stdout+stderr: assertion yang tercetak ke stderr (crash async) ikut dihitung
  const counts = countStatuses(output);
  // ASSERTION FLOOR: suite yang tidak menjalankan satu pun assertion = TIDAK boleh hijau.
  // Env RDI_ALLOW_ZERO_ASSERT=1 hanya untuk skrip diagnostik yang sengaja tanpa assert.
  const allowZero = process.env.RDI_ALLOW_ZERO_ASSERT === '1';
  const noAssert = counts.PASS === 0;
  const ok = res.status === 0 && counts.FAIL === 0 && (counts.PASS > 0 || allowZero);
  return {
    suite: name,
    ok,
    noAssert: noAssert && !allowZero,
    timedOut: !!(res.error && res.error.code === 'ETIMEDOUT'),
    exitCode: res.status,
    counts,
    durationMs: Date.now() - started,
    tail: output.split(/\r?\n/).filter(Boolean).slice(-15),
  };
}

function main() {
  ensureResults();
  const suites = listSuites();
  if (suites.length === 0) {
    console.error('FAIL | no suites in tests/l1');
    process.exit(1);
  }

  console.log('RDI L1 runner — ' + suites.length + ' suite(s) | root=' + ROOT);
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
      else console.log('FAIL (' + r.counts.PASS + 'P/' + r.counts.FAIL + 'F, exit=' + r.exitCode + ')');
      for (const line of r.tail) console.log('       ' + line);
    } else {
      console.log('ok (' + r.counts.PASS + 'P/' + r.counts.FAIL + 'F, ' + r.durationMs + 'ms)');
    }
  }

  const summary = {
    level: 'L1',
    root: ROOT,
    date: new Date().toISOString(),
    suites: results.length,
    suitesFailed,
    assertionsPass: totalPass,
    assertionsFail: totalFail,
    ok: suitesFailed === 0 && totalFail === 0,
    results,
  };

  const outPath = path.join(RESULTS_DIR, 'l1_' + Date.now() + '.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  const latestPath = path.join(RESULTS_DIR, 'l1_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2));

  console.log('---');
  console.log(
    (summary.ok ? 'L1 PASS' : 'L1 FAIL') +
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
