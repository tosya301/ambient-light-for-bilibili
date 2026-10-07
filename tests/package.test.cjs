'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RUNTIME_FILES, FIREFOX_ID, packageExtension } = require('../scripts/package.cjs');
const repoRoot = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'biliglow-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  for (const name of [...RUNTIME_FILES.map(name => `extension/${name}`), 'LICENSE', 'package.json', 'scripts/package.cjs', 'docs/privacy-firefox.html']) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, name), path.join(source, name));
  }
  return { root, source };
}

// Independent reader checks the emitted ZIP's local/central records and exposes
// entry bytes, so tests compare archive contents, not just the staging directory.
function unzipStored(filename) {
  const bytes = fs.readFileSync(filename), entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'portable STORE method');
    const length = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    assert.ok(!entries.has(name), 'no duplicate entries');
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), 'safe relative names');
    const begin = offset + 30 + nameLength + extraLength;
    entries.set(name, bytes.subarray(begin, begin + length));
    offset = begin + length;
  }
  const directoryOffset = offset;
  for (const name of entries.keys()) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const nameLength = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'), name);
    assert.equal(bytes.readUInt32LE(bytes.readUInt32LE(offset + 42)), 0x04034b50, 'central directory points to a local header');
    offset += 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  assert.equal(bytes.readUInt32LE(offset), 0x06054b50);
  assert.equal(bytes.readUInt16LE(offset + 10), entries.size);
  assert.equal(bytes.readUInt32LE(offset + 16), directoryOffset);
  assert.equal(offset + 22, bytes.length);
  return entries;
}

test('browser packages retain shared source bytes and scope, with distinct supported manifests', t => {
  const { root, source } = fixture(t), original = fs.readFileSync(path.join(source, 'extension/manifest.json'));
  const result = packageExtension({ repoRoot: source, outputRoot: path.join(root, 'build') });
  const byBrowser = Object.fromEntries(result.packages.map(pkg => [pkg.browser, unzipStored(pkg.archive)]));
  const chromium = JSON.parse(byBrowser.chromium.get('manifest.json')), firefox = JSON.parse(byBrowser.firefox.get('manifest.json'));
  assert.deepEqual(chromium, JSON.parse(original));
  assert.equal(firefox.manifest_version, 3);
  assert.deepEqual(firefox.background, { scripts: ['background.js'] });
  assert.equal('minimum_chrome_version' in firefox, false);
  assert.equal('version_name' in firefox, false);
  assert.deepEqual(firefox.browser_specific_settings, { gecko: { id: FIREFOX_ID, strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } });
  assert.deepEqual(firefox.permissions, ['storage']);
  assert.deepEqual(firefox.web_accessible_resources, [{ resources: ['privacy.html'], matches: ['https://www.bilibili.com/*', 'https://live.bilibili.com/*'] }]);
  assert.equal('web_accessible_resources' in chromium, false);
  assert.deepEqual(firefox.content_scripts, chromium.content_scripts);
  assert.deepEqual(firefox.commands, chromium.commands);
  assert.equal(firefox.version, chromium.version);
  assert.deepEqual(byBrowser.firefox.get('privacy.html'), fs.readFileSync(path.join(source, 'docs/privacy-firefox.html')));
  assert.equal(byBrowser.chromium.has('privacy.html'), false);
  assert.doesNotMatch(byBrowser.firefox.get('privacy.html').toString(), /<script\b|<link\b|<img\b|@import|url\(/i, 'privacy page loads no external resources');
  for (const name of RUNTIME_FILES.filter(name => name !== 'manifest.json')) {
    assert.deepEqual(byBrowser.firefox.get(name), fs.readFileSync(path.join(source, 'extension', name)), name);
    assert.deepEqual(byBrowser.chromium.get(name), byBrowser.firefox.get(name), name);
  }
  assert.deepEqual(fs.readFileSync(path.join(source, 'extension/manifest.json')), original, 'packaging never rewrites the source manifest');
});

test('allowlist excludes unused assets, screenshots, tests and arbitrary source additions', t => {
  const { root, source } = fixture(t);
  for (const name of ['extension/icons/icon.svg', 'extension/icons/256.png', 'extension/qa/live-color-real-room.jpg', 'extension/.env', 'extension/unexpected.js', 'qa/live-color-real-room.jpg']) {
    fs.mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    fs.writeFileSync(path.join(source, name), 'MUST NOT SHIP');
  }
  const result = packageExtension({ repoRoot: source, outputRoot: path.join(root, 'build') });
  for (const pkg of result.packages) {
    const entries = unzipStored(pkg.archive);
    assert.deepEqual([...entries.keys()].sort(), [...RUNTIME_FILES, 'LICENSE', ...(pkg.browser === 'firefox' ? ['privacy.html'] : [])].sort());
    assert.match(entries.get('LICENSE').toString(), /Copyright \(c\) 2026 Deperenn/);
    for (const [name, bytes] of entries) assert.ok(!bytes.includes('MUST NOT SHIP'), name);
  }
  const sources = unzipStored(result.source.archive);
  assert.deepEqual([...sources.keys()].sort(), [...RUNTIME_FILES.map(name => `extension/${name}`), 'LICENSE', 'package.json', 'scripts/package.cjs', 'docs/privacy-firefox.html', 'BUILDING.txt'].sort());
  for (const [name, bytes] of sources) assert.ok(!bytes.includes('MUST NOT SHIP'), name);
});

test('ZIP bytes are deterministic despite filesystem times, and the source ZIP rebuilds them', t => {
  const { root, source } = fixture(t);
  const first = packageExtension({ repoRoot: source, outputRoot: path.join(root, 'first') });
  fs.utimesSync(path.join(source, 'extension/background.js'), new Date(), new Date());
  const second = packageExtension({ repoRoot: source, outputRoot: path.join(root, 'second') });
  for (let index = 0; index < first.packages.length; index++) {
    assert.deepEqual(fs.readFileSync(first.packages[index].archive), fs.readFileSync(second.packages[index].archive));
  }
  assert.deepEqual(fs.readFileSync(first.source.archive), fs.readFileSync(second.source.archive));
  const extracted = path.join(root, 'extracted');
  for (const [name, bytes] of unzipStored(first.source.archive)) {
    fs.mkdirSync(path.dirname(path.join(extracted, name)), { recursive: true });
    fs.writeFileSync(path.join(extracted, name), bytes);
  }
  const rebuilt = require(path.join(extracted, 'scripts/package.cjs')).packageExtension({ outputRoot: path.join(root, 'rebuilt') });
  for (let index = 0; index < first.packages.length; index++) {
    assert.deepEqual(fs.readFileSync(first.packages[index].archive), fs.readFileSync(rebuilt.packages[index].archive));
  }
});

test('packaging refuses existing destinations and unsafe sources without deleting prior work', t => {
  const { root, source } = fixture(t), outputRoot = path.join(root, 'build');
  fs.mkdirSync(path.join(outputRoot, 'firefox'), { recursive: true });
  const sentinel = path.join(outputRoot, 'firefox', 'keep.txt');
  fs.writeFileSync(sentinel, 'KEEP');
  assert.throws(() => packageExtension({ repoRoot: source, outputRoot }), /Refusing to overwrite/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'KEEP');
  assert.equal(fs.existsSync(path.join(outputRoot, 'chromium')), false, 'preflight must complete before writes');
  assert.throws(() => packageExtension({ repoRoot: source, outputRoot: source }), /separate directory/);
  assert.throws(() => packageExtension({ repoRoot: source, outputRoot: path.join(root, 'bad'), browsers: ['safari'] }), /Unknown browser/);
  const target = path.join(source, 'extension/background.js');
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(repoRoot, 'extension/background.js'), target);
  assert.throws(() => packageExtension({ repoRoot: source, outputRoot: path.join(root, 'symlink') }), /Not a regular file/);
  assert.equal(fs.existsSync(path.join(root, 'symlink')), false);
});
