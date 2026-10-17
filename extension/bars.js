(function (root) {
  'use strict';

  const ZERO = Object.freeze({ top: 0, bottom: 0, left: 0, right: 0 });
  const SIDES = Object.keys(ZERO);
  const MAX_FRACTION = 0.25;
  const MIN_PIXELS = 2;
  const COLOR_TOLERANCE = 16;
  const MAX_NOISE_FRACTION = 0.025;

  function median(values) {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  function distance(data, offset, color) {
    return Math.max(Math.abs(data[offset] - color[0]),
      Math.abs(data[offset + 1] - color[1]), Math.abs(data[offset + 2] - color[2]));
  }

  /**
   * Detect encoded bars, not CSS letterboxing. Margins are fractions of the
   * source frame. null means inconclusive (including a black/flat frame);
   * all-zero margins mean a textured frame with no plausible bars.
   *
   * Both opposing edges must agree. Sampling the middle half first avoids
   * confusing perpendicular bars, then every proposed bar is checked across
   * its full remaining width. This deliberately favors missing uncertain bars
   * over cropping picture content or subtitles.
   */
  function detectProfile(image, options = {}, profile = {}) {
    const { data, width: w, height: h } = image || {};
    if (!data || !Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16 || data.length < w * h * 4) return null;
    const enabled = { horizontal: options.horizontal !== false, vertical: options.vertical !== false };
    if (!enabled.horizontal && !enabled.vertical) return { ...ZERO };
    const colored = options.colored === true;
    const offset = (horizontal, along, depth, end) => {
      const x = horizontal ? along : end ? w - 1 - depth : depth;
      const y = horizontal ? end ? h - 1 - depth : depth : along;
      return (y * w + x) * 4;
    };

    function line(horizontal, end, depth, start, stop, color, stats) {
      let bad = 0, total = 0, sum = 0;
      for (let along = start; along < stop; along++) {
        const d = distance(data, offset(horizontal, along, depth, end), color);
        bad += d > COLOR_TOLERANCE ? 1 : 0;
        sum += Math.min(d, COLOR_TOLERANCE);
        total++;
      }
      if (stats) { stats.bad += bad; stats.total += total; }
      return total > 0 && bad / total <= (profile.lineNoise ?? MAX_NOISE_FRACTION) && sum / total <= 6;
    }

    function edge(horizontal, end) {
      const length = horizontal ? w : h, extent = horizontal ? h : w;
      const start = profile.fullWidth ? 0 : Math.ceil(length * 0.25);
      const stop = profile.fullWidth ? length : Math.floor(length * 0.75);
      const channels = [[], [], []];
      for (let depth = 0; depth < MIN_PIXELS; depth++) {
        for (let along = start; along < stop; along++) {
          const p = offset(horizontal, along, depth, end);
          for (let c = 0; c < 3; c++) channels[c].push(data[p + c]);
        }
      }
      const color = channels.map(median);
      if (!colored && Math.max(...color) > 28) return { possible: false };
      const max = Math.floor(extent * MAX_FRACTION);
      let size = 0;
      while (size <= max && line(horizontal, end, size, start, stop, color)) size++;
      if (size < MIN_PIXELS) return { possible: false };
      if (size > max) return { possible: true };

      // A gradual vignette or a smooth gradient must not count as an edge.
      // The first few picture rows/columns must differ clearly from the bar.
      let far = 0, total = 0;
      for (let depth = size; depth < size + 3; depth++) {
        for (let along = start; along < stop; along++) {
          far += distance(data, offset(horizontal, along, depth, end), color) >= 36 ? 1 : 0;
          total++;
        }
      }
      return far / total >= 0.3 ? { possible: true, size, color } : { possible: true };
    }

    function pair(horizontal) {
      const a = edge(horizontal, false), b = edge(horizontal, true);
      const possible = a.possible || b.possible;
      if (!a.size || !b.size) return { possible };
      // Real letter/pillar boxing is normally centered. Reject isolated dark
      // scenery and incomplete bars rather than guessing an asymmetric crop.
      if (Math.abs(a.size - b.size) > Math.max(2, (a.size + b.size) * 0.06)) return { possible: true };
      return { possible: true, a, b };
    }

    const rows = pair(true), columns = profile.fullWidth ? { possible: false } : pair(false);
    const proposed = {
      top: rows.a?.size || 0, bottom: rows.b?.size || 0,
      left: columns.a?.size || 0, right: columns.b?.size || 0
    };

    function validate(pairResult, horizontal) {
      if (!pairResult.a) return false;
      const start = horizontal ? proposed.left : proposed.top;
      const stop = horizontal ? w - proposed.right : h - proposed.bottom;
      for (const [end, e] of [[false, pairResult.a], [true, pairResult.b]]) {
        const stats = profile.bandNoise === undefined ? null : { bad: 0, total: 0 };
        for (let depth = 0; depth < e.size; depth++) {
          if (!line(horizontal, end, depth, start, stop, e.color, stats)) return false;
        }
        if (stats && stats.bad / stats.total > profile.bandNoise) return false;
      }
      return true;
    }

    const horizontal = validate(rows, true), vertical = validate(columns, false);
    // A failed perpendicular edge invalidates the other proposal if it relied
    // on excluding that edge during validation.
    if ((rows.a && !horizontal) || (columns.a && !vertical)) return null;

    // A single solid picture (white title card, black scene, colored fade) is
    // insufficient evidence even if a strong rectangular border surrounds it.
    const channels = [[], [], []];
    const left = horizontal || vertical ? proposed.left : Math.floor(w * 0.25);
    const right = horizontal || vertical ? w - proposed.right : Math.ceil(w * 0.75);
    const top = horizontal || vertical ? proposed.top : Math.floor(h * 0.25);
    const bottom = horizontal || vertical ? h - proposed.bottom : Math.ceil(h * 0.75);
    for (let y = top; y < bottom; y += 3) {
      for (let x = left; x < right; x += 3) {
        const p = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) channels[c].push(data[p + c]);
      }
    }
    const variation = Math.max(...channels.map(values => {
      values.sort((a, b) => a - b);
      return values[Math.floor(values.length * 0.9)] - values[Math.floor(values.length * 0.1)];
    }));
    if (variation < 30) return null;
    const cropHorizontal = horizontal && enabled.horizontal;
    const cropVertical = vertical && enabled.vertical;
    if (!cropHorizontal && !cropVertical) return (enabled.horizontal && rows.possible) || (enabled.vertical && columns.possible) ? null : { ...ZERO };
    return {
      top: cropHorizontal ? proposed.top / h : 0,
      bottom: cropHorizontal ? proposed.bottom / h : 0,
      left: cropVertical ? proposed.left / w : 0,
      right: cropVertical ? proposed.right / w : 0
    };
  }

  // Cropping must reject subtitles and watermarks rather than remove them.
  // Keep that strict policy unchanged. Fullscreen protection only mutes outer
  // light: sparse text may occupy <=25% of a row and <=10% of either black band.
  // Downsampled glyph antialiasing counts toward both limits.
  function detect(image, options = {}) { return detectProfile(image, options); }
  function detectFullscreenBars(image) {
    return detectProfile(image, { horizontal: true, vertical: false, colored: false },
      { fullWidth: true, lineNoise: 0.25, bandNoise: 0.1 });
  }

  /** At least three consecutive confident samples are required for a change.
   * Inconclusive frames interrupt confirmation but retain the established crop.
   * reset() must be called after a source, mode, or detection-option change.
   */
  function createTracker(options = {}) {
    const stableFrames = Math.max(3, Math.floor(Number(options.stableFrames) || 3));
    const tolerance = Number.isFinite(options.tolerance) ? Math.max(0, Math.min(0.02, options.tolerance)) : 0.008;
    let current = { ...ZERO }, pending = null, count = 0;
    const close = (a, b) => SIDES.every(side =>
      (a[side] === 0) === (b[side] === 0) && Math.abs(a[side] - b[side]) <= tolerance);
    const valid = value => value && SIDES.every(side =>
      Number.isFinite(value[side]) && value[side] >= 0 && value[side] <= MAX_FRACTION);
    return {
      update(value) {
        if (!valid(value)) { pending = null; count = 0; return { ...current }; }
        if (close(value, current)) { pending = null; count = 0; return { ...current }; }
        if (pending && close(value, pending)) {
          // Choose the smaller stable margin so detection jitter cannot shave
          // a thin strip of picture off the next frame.
          for (const side of SIDES) pending[side] = Math.min(pending[side], value[side]);
          count++;
        } else { pending = { ...value }; count = 1; }
        if (count >= stableFrames) { current = pending; pending = null; count = 0; }
        return { ...current };
      },
      reset() { current = { ...ZERO }; pending = null; count = 0; return { ...current }; },
      get current() { return { ...current }; }
    };
  }

  const api = Object.freeze({ detect, detectFullscreenBars, createTracker });
  root.BiliGlowBars = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
