// OI-01 version consistency — source of truth = APP_VERSION in index.html
const fs = require('fs');
const path = require('path');
const ROOT = process.env.RDI_TEST_ROOT || path.resolve(__dirname, '../..');
let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const scanner = fs.readFileSync(path.join(ROOT, 'scanner.html'), 'utf8');
const backup = fs.readFileSync(path.join(ROOT, 'Backup', 'index.html'), 'utf8');

const appVer = (html.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
const apple = (html.match(/apple-mobile-web-app-title[^>]*content="([^"]+)"/) || [])[1];
const cssHdr = (html.match(/STYLESHEET \(([^)]+)\)/) || [])[1];
const jsHdr = (html.match(/APPLICATION LOGIC \(([^)]+)\)/) || [])[1];
const scannerTitle = (scanner.match(/<title>([^<]+)<\/title>/) || [])[1];

t('Source of truth APP_VERSION present', !!appVer, 'APP_VERSION=' + appVer);
t('Static <title> matches APP_VERSION', !!appVer && !!title && title.includes(appVer), title);
t('apple-mobile-web-app-title matches APP_VERSION', !!appVer && !!apple && apple.includes(appVer), apple);
t('CSS stylesheet header matches APP_VERSION', !!appVer && cssHdr === appVer, cssHdr);
t('JS application header matches APP_VERSION', !!appVer && jsHdr === appVer, jsHdr);
t('No stale v14.98 in title/meta/header', !/v14\.98/.test(title || '') && !/v14\.98/.test(apple || '') && !/v14\.98/.test(cssHdr || '') && !/v14\.98/.test(jsHdr || ''),
  'title=' + title + ' apple=' + apple + ' css=' + cssHdr + ' js=' + jsHdr);

// manifest intentionally has NO version in name/short_name (PWA convention)
t('manifest name has no version (by design)', !/\bv\d/.test(manifest.name || ''), manifest.name);
t('manifest short_name has no version (by design)', !/\bv\d/.test(manifest.short_name || ''), manifest.short_name);
t('scanner.html title has no app version (by design)', !/\bv\d+\.\d+/.test(scannerTitle || ''), scannerTitle);

// Historical fix comments must retain their original versions (do not rewrite history)
const hist = [...html.matchAll(/FIX[^\n(]*\(v[\d.]+\)/g)].map(m => m[0]);
t('Historical FIX comments retained', hist.length >= 5, 'count=' + hist.length + ' sample=' + hist[0]);

// Backup must stay untouched with old versions
const bakVer = (backup.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
const bakTitle = (backup.match(/<title>([^<]+)<\/title>/) || [])[1];
t('Backup/ left historical (not modified)', !!bakTitle && bakTitle !== title, 'backup title=' + bakTitle);

// initVersionLabels still syncs runtime title from APP_VERSION (no late mismatch)
t('initVersionLabels rewrites title from APP_VERSION', /document\.title\s*=\s*document\.title\.replace\(/.test(html) && /initVersionLabels/.test(html), 'runtime sync present');

// Since static title already equals APP_VERSION, first paint matches post-boot (no flicker source)
t('Static title equals APP_VERSION (no title flicker)', !!appVer && !!title && title.includes(appVer), 'static already ' + appVer);

console.log('=== VERSION CONSISTENCY: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
