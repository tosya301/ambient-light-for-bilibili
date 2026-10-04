/**
 * Builds both store packages from the single `extension/` source tree.
 * Nothing outside `outputs/` is written: the Chrome sources stay byte-identical
 * and the Gecko differences are confined to a generated manifest.
 *
 * Gecko needs keys Chromium rejects, and vice versa:
 *   - background.service_worker -> background.scripts. Gecko has no MV3 service
 *     worker; it runs the same background.js as a non-persistent event page.
 *   - browser_specific_settings.gecko.id is mandatory. Without it Firefox/Zen
 *     refuses to install the XPI at all (verified on Zen 1.23b / Gecko 157).
 *   - minimum_chrome_version and version_name are Chromium-only.
 *
 * Usage: node tools/build.mjs [chromium|firefox]  (default: both)
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'extension');
const outputs = path.join(root, 'outputs');

// Stable add-on identity. Firefox keys chrome.storage.local and the signed
// install record off this value, so it must not change after the first release.
const GECKO_ID = 'ambient-light-for-bilibili@tosya301.github.io';
const STRICT_MIN_VERSION = '128.0';
// Matches the asset names already used by the existing GitHub releases.
const ASSET = 'Ambient-light-for-Bilibili';

const chromiumManifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
if (chromiumManifest.manifest_version !== 3) {
  throw new Error(`expected manifest_version 3, got ${chromiumManifest.manifest_version}`);
}

async function walk(dir, prefix = '') {
  const entries = await readdir(dir, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => {
    const rel = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? walk(path.join(dir, entry.name), rel) : rel;
  }))).flat();
}

async function pack(target, dir) {
  const out = path.join(outputs, path.basename(target));
  await rm(out, {force: true});
  // Explicit file list: keeps paths relative to the package root (no "./"
  // prefix), which the XPI installer requires for manifest.json.
  const files = (await walk(dir)).sort();
  execFileSync('zip', ['-X', '-q', out, ...files], {cwd: dir});
  const digest = createHash('sha256').update(await readFile(out)).digest('hex');
  console.log(`${target}\n  zip: ${path.relative(root, out)} (${files.length} files, sha256 ${digest.slice(0, 16)}…)\n  files: ${files.join(', ')}`);
}

async function stage(name) {
  const dir = path.join(outputs, name);
  await rm(dir, {recursive: true, force: true});
  await mkdir(dir, {recursive: true});
  await cp(source, dir, {recursive: true});
  return dir;
}

function geckoManifest() {
  if (typeof chromiumManifest.background?.service_worker !== 'string') {
    throw new Error('extension/manifest.json no longer declares background.service_worker; review the Gecko transform');
  }
  if ('browser_specific_settings' in chromiumManifest || 'scripts' in chromiumManifest.background) {
    throw new Error('extension/manifest.json already carries Gecko keys; the transform would be redundant');
  }
  const manifest = structuredClone(chromiumManifest);
  delete manifest.minimum_chrome_version;
  delete manifest.version_name;
  manifest.background = {scripts: [chromiumManifest.background.service_worker]};
  manifest.browser_specific_settings = {gecko: {id: GECKO_ID, strict_min_version: STRICT_MIN_VERSION}};
  return manifest;
}

const wanted = process.argv.slice(2);
const build = target => wanted.length === 0 || wanted.includes(target);

await mkdir(outputs, {recursive: true});

if (build('chromium')) {
  const dir = await stage('chromium');
  await pack(`${ASSET}-${chromiumManifest.version}.zip`, dir);
  console.log(`  manifest: unchanged from extension/manifest.json (${chromiumManifest.version})`);
}

if (build('firefox')) {
  const manifest = geckoManifest();
  const dir = await stage('firefox');
  await writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await pack(`${ASSET}-${chromiumManifest.version}-firefox-unsigned.xpi`, dir);
  const changed = Object.keys(manifest).filter(key => JSON.stringify(manifest[key]) !== JSON.stringify(chromiumManifest[key]));
  const dropped = ['minimum_chrome_version', 'version_name'].filter(key => key in chromiumManifest);
  console.log(`  manifest: changed ${changed.join(', ')}; dropped ${dropped.join(', ')}`);
  console.log(`  gecko id: ${GECKO_ID} (strict_min_version ${STRICT_MIN_VERSION})`);
  console.log('  unsigned: submit to addons.mozilla.org (unlisted / self-distribution) before permanent install');
}
