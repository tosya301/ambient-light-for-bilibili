#!/usr/bin/env node
'use strict';

// Node.js standard library only. Runtime JavaScript and CSS are copied verbatim.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RUNTIME_FILES = Object.freeze([
  '_locales/zh_CN/messages.json',
  'background.js', 'bar-effects.js', 'bars.js', 'content.js',
  'icons/16.png', 'icons/32.png', 'icons/48.png', 'icons/128.png',
  'manifest.json', 'page.css', 'player.js', 'popup.css', 'popup.html',
  'popup.js', 'preview.js', 'shared.js'
].sort());
const FIREFOX_ID = 'ambient-light-for-bilibili@tosya301';
const BUILD_INSTRUCTIONS = `Ambient light for Bilibili — reproducible source package

Requirements: Node.js 18 or later (https://nodejs.org/), on macOS, Linux or Windows.
No npm install, third-party packages, network access or additional tools are needed.
From this source directory run:

  node scripts/package.cjs --browser firefox

The installable ZIP and unpacked directory will be written under dist/.
Use --browser chromium for Chrome/Edge or --browser all for both.
For another run, choose a fresh output directory, for example:

  node scripts/package.cjs --browser firefox --out-dir dist-second

Existing output packages are never replaced or deleted. Files are selected by an
explicit allowlist. All runtime JavaScript, HTML and CSS are copied byte for byte;
only the Firefox manifest is derived from extension/manifest.json. The standalone
docs/privacy-firefox.html is copied to privacy.html in the Firefox package.
ZIP entries
use the store method, a fixed timestamp, stable ordering and fixed permissions,
so identical source bytes produce identical ZIP bytes across these platforms.
LICENSE is included in every distribution. No minification, bundling or remote
code is used. The accompanying source ZIP contains everything needed to rebuild.
`;

function readRegularFile(filename) {
  if (!fs.lstatSync(filename).isFile()) throw new Error(`Not a regular file: ${filename}`);
  return fs.readFileSync(filename);
}

function manifestForBrowser(source, browser) {
  if (!['chromium', 'firefox'].includes(browser)) throw new Error(`Unknown browser: ${browser}`);
  const manifest = JSON.parse(JSON.stringify(source));
  if (browser === 'firefox') {
    manifest.background = { scripts: ['background.js'] };
    delete manifest.minimum_chrome_version;
    delete manifest.version_name;
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] }
      }
    };
    manifest.web_accessible_resources = [{
      resources: ['privacy.html'],
      matches: ['https://www.bilibili.com/*', 'https://live.bilibili.com/*']
    }];
  }
  return manifest;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Small ZIP writer using the uncompressed STORE method: no tool/version-specific
// compression output, host timestamps, directory records or filesystem metadata.
function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, bytes] of [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const filename = Buffer.from(name, 'utf8');
    const checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8
    header.writeUInt16LE(0x0021, 12); // 1980-01-01 00:00:00
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x0314, 4); // UNIX, ZIP 2.0
    header.copy(directory, 6, 4, 30);
    directory.writeUInt32LE((0o100644 * 65536) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function packageExtension({ repoRoot = path.resolve(__dirname, '..'), outputRoot, browsers = ['chromium', 'firefox'] } = {}) {
  repoRoot = path.resolve(repoRoot);
  outputRoot = path.resolve(outputRoot || path.join(repoRoot, 'dist'));
  const extensionRoot = path.join(repoRoot, 'extension');
  if (outputRoot === repoRoot || outputRoot === extensionRoot || outputRoot.startsWith(extensionRoot + path.sep)) {
    throw new Error('Output must be a separate directory outside extension/.');
  }
  if (!browsers.length || new Set(browsers).size !== browsers.length) throw new Error('Choose distinct browser targets.');
  const source = new Map(RUNTIME_FILES.map(name => [name, readRegularFile(path.join(extensionRoot, name))]));
  const sourceManifest = JSON.parse(source.get('manifest.json').toString('utf8'));
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(sourceManifest.version)) throw new Error('Unsupported version format.');
  const license = readRegularFile(path.join(repoRoot, 'LICENSE'));
  const prefix = `Ambient-light-for-Bilibili-${sourceManifest.version}`;
  const packages = browsers.map(browser => {
    const manifest = manifestForBrowser(sourceManifest, browser);
    const entries = [...source].map(([name, bytes]) => [name, name === 'manifest.json'
      ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n') : bytes]);
    entries.push(['LICENSE', license]);
    if (browser === 'firefox') entries.push(['privacy.html', readRegularFile(path.join(repoRoot, 'docs', 'privacy-firefox.html'))]);
    return { browser, entries, directory: path.join(outputRoot, browser), archive: path.join(outputRoot, `${prefix}-${browser}.zip`) };
  });
  const sourceEntries = [
    ...[...source].map(([name, bytes]) => [`extension/${name}`, bytes]),
    ['LICENSE', license],
    ['package.json', readRegularFile(path.join(repoRoot, 'package.json'))],
    ['scripts/package.cjs', readRegularFile(path.join(repoRoot, 'scripts', 'package.cjs'))],
    ['docs/privacy-firefox.html', readRegularFile(path.join(repoRoot, 'docs', 'privacy-firefox.html'))],
    ['BUILDING.txt', Buffer.from(BUILD_INSTRUCTIONS)]
  ];
  const sourceArchive = path.join(outputRoot, `${prefix}-source.zip`);
  const destinations = [...packages.flatMap(p => [p.directory, p.archive]), sourceArchive];
  for (const destination of destinations) {
    if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing output: ${destination}. Choose a fresh --out-dir.`);
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const reports = [];
  for (const pkg of packages) {
    fs.mkdirSync(pkg.directory);
    for (const [name, bytes] of pkg.entries) {
      const filename = path.join(pkg.directory, name);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, bytes, { flag: 'wx' });
    }
    const archiveBytes = zip(pkg.entries);
    fs.writeFileSync(pkg.archive, archiveBytes, { flag: 'wx' });
    reports.push({ browser: pkg.browser, directory: pkg.directory, archive: pkg.archive, files: pkg.entries.map(([name]) => name).sort(), sha256: crypto.createHash('sha256').update(archiveBytes).digest('hex') });
  }
  const sourceBytes = zip(sourceEntries);
  fs.writeFileSync(sourceArchive, sourceBytes, { flag: 'wx' });
  return { version: sourceManifest.version, packages: reports, source: { archive: sourceArchive, files: sourceEntries.map(([name]) => name).sort(), sha256: crypto.createHash('sha256').update(sourceBytes).digest('hex') } };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let browser = 'all', outputRoot;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--browser' && args[i + 1]) browser = args[++i];
      else if (args[i] === '--out-dir' && args[i + 1]) outputRoot = args[++i];
      else throw new Error('Usage: node scripts/package.cjs [--browser all|chromium|firefox] [--out-dir NEW_DIRECTORY]');
    }
    const browsers = browser === 'all' ? ['chromium', 'firefox'] : [browser];
    console.log(JSON.stringify(packageExtension({ outputRoot, browsers }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { RUNTIME_FILES, FIREFOX_ID, manifestForBrowser, packageExtension };
