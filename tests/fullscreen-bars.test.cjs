const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
const defaults = { enabled: true, removeHorizontalBars: false, removeVerticalBars: false,
  detectColoredBars: false, fillRemovedBars: false };
const plain = value => JSON.parse(JSON.stringify(value));

function frame({ top = 0, bottom = 0, left = 0, right = 0,
  color = [0, 0, 0], flat = null, subtitle = false } = {}) {
  const width = 320, height = 180, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = y < top || y >= height - bottom || x < left || x >= width - right;
    const rgb = bar ? color : flat || [60 + (x * 17 + y * 3) % 180,
      45 + (x * 3 + y * 11) % 180, 65 + (x * 7 + y * 5) % 170];
    const offset = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) data[offset + c] = rgb[c];
    data[offset + 3] = 255;
    if (subtitle && y >= 164 && y < 173 && x >= 90 && x < 230 && (subtitle === 'dense' || x % 8 < 4))
      data.set([240, 240, 240, 255], offset);
  }
  return { width, height, data };
}

function harness({ settings = {}, mode = 'fullscreen', image = frame({ top: 22, bottom: 22 }),
  paused = false, css = {} } = {}) {
  const properties = new Map([['--host-property', 'preserved']]), attributes = new Map();
  const counts = { draws: 0, reads: 0, changes: 0, writes: 0 };
  const style = { transform: '', clipPath: '',
    setProperty(key, value) { counts.writes++; properties.set(key, value); },
    removeProperty(key) { properties.delete(key); },
    getPropertyValue(key) { return properties.get(key) || ''; } };
  const video = { style, paused, ended: false, readyState: 4, videoWidth: 1920,
    videoHeight: 1080, currentTime: 1,
    setAttribute(key, value) { attributes.set(key, value); },
    removeAttribute(key) { attributes.delete(key); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1728, height: 1080 }; } };
  const state = { image, error: null, readError: null, now: 0, css: { transform: 'none', clipPath: 'none',
    objectFit: 'contain', objectPosition: '50% 50%', ...css } };
  const canvas = { width: 320, height: 180, getContext() { return {
    drawImage(source) { assert.equal(source, video); counts.draws++; if (state.error) throw state.error; },
    getImageData() { counts.reads++; if (state.readError) throw state.readError; return state.image; }
  }; } };
  const context = vm.createContext({ document: { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } },
    getComputedStyle() { return { ...state.css, transform: style.transform || state.css.transform,
      clipPath: style.clipPath || state.css.clipPath }; } });
  for (const file of ['bars.js', 'bar-effects.js']) vm.runInContext(fs.readFileSync(
    path.join(__dirname, '../extension', file), 'utf8'), context, { filename: file });
  const effect = context.BiliGlowVideoBars.create(video, { onChange() { counts.changes++; } });
  let config = { ...defaults, ...settings };
  effect.configure(config, mode);
  return { effect, video, state, counts, attributes, properties,
    configure(next, nextMode = mode) { config = { ...config, ...next }; mode = nextMode; effect.configure(config, mode); },
    sample({ observe = true, advanceTime = !video.paused, elapsed = 500 } = {}) {
      state.now += elapsed;
      if (advanceTime) video.currentTime += .5;
      effect.layout(); effect.sample(state.now, observe);
    },
    samples(count = 3, options) { for (let i = 0; i < count; i++) this.sample(options); },
    assertUnchangedPicture() {
      assert.deepEqual(plain(effect.crop), ZERO);
      assert.equal(attributes.has('data-biliglow-bar-crop'), false);
      assert.equal(properties.has('--biliglow-video-clip'), false);
      assert.equal(properties.has('--biliglow-video-transform'), false);
      assert.equal(properties.get('--host-property'), 'preserved');
      assert.equal(counts.writes, 0, 'fullscreen observation never writes a crop or transform');
    }
  };
}

test('fullscreen confirms encoded black horizontal bars after three samples without changing the picture', () => {
  const h = harness();
  h.sample(); assert.equal(h.effect.fullscreenBars, false);
  h.sample(); assert.equal(h.effect.fullscreenBars, false);
  h.sample(); assert.equal(h.effect.fullscreenBars, true);
  assert.equal(h.counts.reads, 3);
  h.assertUnchangedPicture();
});

test('fullscreen black-bar protection ignores crop preferences and never treats colored bars as black', () => {
  for (const settings of [{}, { removeHorizontalBars: true, removeVerticalBars: true,
    detectColoredBars: true, fillRemovedBars: true }]) {
    const h = harness({ settings }); h.samples();
    assert.equal(h.effect.fullscreenBars, true); h.assertUnchangedPicture();
  }
  const colored = harness({ settings: { detectColoredBars: true },
    image: frame({ top: 22, bottom: 22, color: [60, 85, 110] }) });
  colored.samples(); assert.equal(colored.effect.fullscreenBars, false); colored.assertUnchangedPicture();
  const sidebars = harness({ image: frame({ left: 40, right: 40 }) });
  sidebars.samples(); assert.equal(sidebars.effect.fullscreenBars, false); sidebars.assertUnchangedPicture();
});

test('fullscreen observation is explicitly requested, while theater crop sampling keeps its existing API', () => {
  const h = harness(); h.samples(4, { observe: false });
  assert.equal(h.counts.reads, 0); assert.equal(h.effect.fullscreenBars, false);
  h.samples(); assert.equal(h.effect.fullscreenBars, true); h.assertUnchangedPicture();
  const theater = harness({ mode: 'theater', settings: { removeHorizontalBars: true } });
  theater.samples(3, { observe: false });
  assert.ok(theater.effect.crop.top > 0); assert.ok(theater.effect.crop.bottom > 0);
  assert.equal(theater.effect.fullscreenBars, false);
});

test('confirmed fullscreen bars survive inconclusive dense subtitles and dark scenes, then release after three clear frames', () => {
  const h = harness(); h.samples(); assert.equal(h.effect.fullscreenBars, true);
  for (const image of [frame({ top: 22, bottom: 22, subtitle: 'dense' }), frame({ flat: [0, 0, 0] })]) {
    h.state.image = image; h.samples(4); assert.equal(h.effect.fullscreenBars, true);
  }
  h.state.image = frame();
  h.sample(); assert.equal(h.effect.fullscreenBars, true);
  h.sample(); assert.equal(h.effect.fullscreenBars, true);
  h.sample(); assert.equal(h.effect.fullscreenBars, false);
  h.assertUnchangedPicture();
});

test('inconclusive and isolated dark edges do not initially confirm fullscreen black bars', () => {
  for (const image of [frame({ flat: [0, 0, 0] }), frame({ flat: [180, 180, 180] }),
    frame({ top: 22, bottom: 22, flat: [180, 180, 180] }), frame({ top: 22 }),
    frame({ top: 22, bottom: 22, subtitle: 'dense' })]) {
    const h = harness({ image }); h.samples(5);
    assert.equal(h.effect.fullscreenBars, false); h.assertUnchangedPicture();
  }
});

test('initial sparse text confirms fullscreen protection while theater cropping remains strict', () => {
  const image = frame({ top: 22, bottom: 22, subtitle: true });
  const fullscreen = harness({ image }); fullscreen.samples();
  assert.equal(fullscreen.effect.fullscreenBars, true); fullscreen.assertUnchangedPicture();
  const theater = harness({ image, mode: 'theater', settings: { removeHorizontalBars: true } });
  theater.samples(4); assert.deepEqual(plain(theater.effect.crop), ZERO);
  assert.equal(theater.effect.fullscreenBars, false); theater.assertUnchangedPicture();
});

test('paused fullscreen can confirm an unchanged frame but playing duplicate timestamps do not count', () => {
  const paused = harness({ paused: true }); paused.samples();
  assert.equal(paused.video.currentTime, 1); assert.equal(paused.effect.fullscreenBars, true);
  paused.assertUnchangedPicture();
  const playing = harness(); playing.samples(5, { advanceTime: false });
  assert.equal(playing.counts.reads, 1); assert.equal(playing.effect.fullscreenBars, false);
  playing.samples(2); assert.equal(playing.effect.fullscreenBars, true); playing.assertUnchangedPicture();
});

test('fullscreen source reads remain rate limited even when called by repeated layout invalidation', () => {
  const h = harness({ paused: true });
  h.sample({ elapsed: 1 });
  h.samples(3, { elapsed: 100 });
  assert.equal(h.counts.reads, 1); assert.equal(h.effect.fullscreenBars, false);
  h.sample({ elapsed: 100 });
  assert.equal(h.counts.reads, 2); assert.equal(h.effect.fullscreenBars, false);
  h.sample({ elapsed: 400 });
  assert.equal(h.counts.reads, 3); assert.equal(h.effect.fullscreenBars, true);
  h.assertUnchangedPicture();
});

test('fullscreen confirmation resets on source reset, leaving fullscreen and disabling the extension', () => {
  for (const transition of ['source-reset', 'normal', 'theater', 'disabled']) {
    const h = harness(); h.samples(); assert.equal(h.effect.fullscreenBars, true);
    if (transition === 'source-reset') h.effect.reset();
    else h.configure(transition === 'disabled' ? { enabled: false } : {},
      transition === 'disabled' ? 'fullscreen' : transition);
    assert.equal(h.effect.fullscreenBars, false, transition);
    h.state.image = frame(); h.samples(4);
    assert.equal(h.effect.fullscreenBars, false, transition); h.assertUnchangedPicture();
  }
});

test('fullscreen observation refuses transformed, clipped, non-contain and off-center player pictures', () => {
  for (const css of [{ transform: 'matrix(1, 0, 0, 1, 10, 0)' }, { clipPath: 'inset(2px)' },
    { objectFit: 'cover' }, { objectPosition: 'left center' }]) {
    const h = harness({ css }); h.samples(4);
    assert.equal(h.effect.fullscreenBars, false, JSON.stringify(css)); h.assertUnchangedPicture();
  }
  const h = harness(); h.samples(); assert.equal(h.effect.fullscreenBars, true);
  h.state.css.objectFit = 'cover'; h.effect.layout();
  assert.equal(h.effect.fullscreenBars, false, 'a new host picture transform clears established protection');
  h.assertUnchangedPicture();
});

test('fullscreen sampling failure clears protection, preserves host styles and recovers after reset', () => {
  for (const [key, name] of [['readError', 'SecurityError'], ['error', 'InvalidStateError']]) {
    const h = harness(); h.samples(); assert.equal(h.effect.fullscreenBars, true);
    h.state[key] = Object.assign(new Error('synthetic source read failure'), { name });
    assert.doesNotThrow(() => h.sample());
    assert.equal(h.effect.fullscreenBars, false); h.assertUnchangedPicture();
    h.state[key] = null; h.effect.reset(); h.samples();
    assert.equal(h.effect.fullscreenBars, true); h.assertUnchangedPicture();
  }
});

test('disabled, normal mode and unready fullscreen video never read source pixels', () => {
  for (const options of [{ settings: { enabled: false } }, { mode: 'normal' }]) {
    const h = harness(options); h.samples(4);
    assert.equal(h.counts.draws, 0); assert.equal(h.effect.fullscreenBars, false); h.assertUnchangedPicture();
  }
  const unready = harness(); unready.video.readyState = 1; unready.samples(4);
  assert.equal(unready.counts.draws, 0); assert.equal(unready.effect.fullscreenBars, false);
  unready.assertUnchangedPicture();
});
