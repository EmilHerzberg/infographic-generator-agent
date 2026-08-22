// Structural inspector — renders a post in headless Chromium and measures it
// against the design system's hard rules. Returns a machine-readable report the
// agent (and CI, and the Path A renderer) can gate on. No model involved.
//
// Encodes context/07-mobile-first.md: 1080->~390px is a ~2.77x downscale; outer
// safe margin >=64px; bottom 80px reserved; absolute type floor 18px source.
// Playwright is lazy-loaded inside inspectLayout (below) — a devDependency, so the production
// orchestrator image (which imports this module transitively but, in isolated mode, dispatches the
// actual inspection to the gen container) can load without it installed.

// Runs in the page. Self-contained (no external refs) so it serializes cleanly.
// Exported so multi-`t` check passes (tools/qa-countup.mjs) can drive their own page/URLs
// through one browser and still use the exact same measurement (CHECKS.md gap #2).
export function measure() {
  const DOWNSCALE = 1 / 2.77;
  const FLOOR_SRC = 18; // hard absolute floor (px, source) — below this is never ok
  const MARGIN = 64; // outer safe margin
  const canvas = document.querySelector("#post-canvas");
  if (!canvas) return { error: "no #post-canvas element found" };
  const cb = canvas.getBoundingClientRect();
  const W = Math.round(cb.width), H = Math.round(cb.height);
  const toLocal = (r) => ({
    x: r.left - cb.left, y: r.top - cb.top, w: r.width, h: r.height,
    right: r.right - cb.left, bottom: r.bottom - cb.top,
  });
  const visible = (el) => {
    const s = getComputedStyle(el);
    return !(s.visibility === "hidden" || s.display === "none" || parseFloat(s.opacity) === 0);
  };

  const els = [...canvas.querySelectorAll("*")].filter(visible);
  const textEls = els.filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
  );
  // text leaves: a text element that doesn't contain another text element
  const leaves = textEls.filter((el) => !textEls.some((o) => o !== el && el.contains(o)));

  // Cumulative CSS `zoom` from an element up to the canvas. FitZone scales content with
  // `zoom` (which the inspector's geometry checks already see via getBoundingClientRect),
  // but getComputedStyle().fontSize reports the PRE-zoom size — so the effective rendered
  // type size is fontSize × cumulativeZoom. The mobile-floor check must use the effective
  // size, else a layout could pass the gate by zooming text below readability.
  const cumulativeZoom = (el) => {
    let z = 1;
    for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
      const zv = parseFloat(getComputedStyle(n).zoom);
      if (Number.isFinite(zv) && zv > 0) z *= zv;
    }
    return z;
  };

  const measured = leaves.map((el) => {
    const s = getComputedStyle(el);
    const zoom = cumulativeZoom(el);
    return {
      role: el.getAttribute("data-inspect") || el.getAttribute("data-floor") || null,
      text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 32),
      fontSize: parseFloat(s.fontSize),
      effFontSize: parseFloat(s.fontSize) * zoom,
      color: s.color,
      rect: toLocal(el.getBoundingClientRect()),
      _el: el,
    };
  });
  const label = (m) => m.role || JSON.stringify(m.text);

  const belowMobileFloor = measured
    .filter((m) => m.effFontSize < FLOOR_SRC)
    .map((m) => ({
      el: label(m),
      sourcePx: Math.round(m.effFontSize),
      downscaledPx: +(m.effFontSize * DOWNSCALE).toFixed(1),
      floorPx: FLOOR_SRC,
    }));

  // The creator signature is identity chrome — designed to live in the footer, so
  // it's exempt from the bottom-reserve / safe-margin rule (it must still be present).
  const inSignature = (el) => !!el.closest('[aria-label^="Creator:"]');

  const outOfSafeMargin = [];
  for (const m of measured) {
    if (inSignature(m._el)) continue;
    const r = m.rect;
    if (r.x < MARGIN - 0.5) outOfSafeMargin.push({ el: label(m), side: "left", byPx: Math.round(MARGIN - r.x) });
    if (r.y < MARGIN - 0.5) outOfSafeMargin.push({ el: label(m), side: "top", byPx: Math.round(MARGIN - r.y) });
    if (r.right > W - MARGIN + 0.5) outOfSafeMargin.push({ el: label(m), side: "right", byPx: Math.round(r.right - (W - MARGIN)) });
    if (r.bottom > H - MARGIN + 0.5) outOfSafeMargin.push({ el: label(m), side: "bottom", byPx: Math.round(r.bottom - (H - MARGIN)) });
  }

  const collisions = [];
  for (let a = 0; a < measured.length; a++) {
    for (let b = a + 1; b < measured.length; b++) {
      const A = measured[a].rect, B = measured[b].rect;
      const ox = Math.min(A.right, B.right) - Math.max(A.x, B.x);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.y, B.y);
      if (ox > 4 && oy > 4) {
        collisions.push({ a: label(measured[a]), b: label(measured[b]), overlapPx: Math.round(Math.min(ox, oy)) });
      }
    }
  }

  // approximate contrast (advisory only — does not gate pass)
  const lum = (c) => {
    const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const bg = getComputedStyle(n).backgroundColor;
      const a = (bg.match(/[\d.]+/g) || []).map(Number);
      const transparent = bg === "transparent" || (a.length === 4 && a[3] === 0);
      if (bg && !transparent) return bg;
      n = n.parentElement;
    }
    return "rgb(31,28,26)"; // warm graphite fallback
  };
  const ratio = (c1, c2) => { const L1 = lum(c1), L2 = lum(c2); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const lowContrast = [];
  for (const m of measured) {
    try {
      const cr = ratio(m.color, bgOf(m._el));
      const min = m.fontSize >= 30 ? 3 : 4.5;
      if (cr < min) lowContrast.push({ el: label(m), ratio: +cr.toFixed(2), min });
    } catch {}
  }

  // Clipping/overflow: content cut off by a container with overflow hidden/clip/auto/scroll
  // (the "0.60 is cut off" defect). scrollWidth/Height > clientWidth/Height => content doesn't fit.
  const elLabel = (el) => {
    const r = el.getAttribute("data-inspect");
    if (r) return r;
    const txt = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (txt) return JSON.stringify(txt.slice(0, 24));
    const cls = typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "";
    return el.tagName.toLowerCase() + cls;
  };
  const clipped = [];
  for (const el of els) {
    const s = getComputedStyle(el);
    const cw = el.clientWidth, ch = el.clientHeight;
    // Name the CAUSE when it's mechanical: an x-clip whose content (or the element itself) carries
    // white-space:nowrap is unfixable by rewording — the agent must drop nowrap / use FitLine. Without
    // this hint a real run rewrote the TEXT seven times against a constant 96px overflow and lost.
    const hasNowrap = (node) => {
      if (getComputedStyle(node).whiteSpace === "nowrap") return true;
      for (const c of node.children) if (c instanceof HTMLElement && hasNowrap(c)) return true;
      return false;
    };
    // DECORATIVE BLEED is not clipping: an ambient glow (textless, pointer-events:none, absolutely
    // offset past the edge — the Panel-overlay idiom) inflates scrollWidth by design and paints no
    // content that could be "cut off". If EVERY box protruding past the edge is such a decoration,
    // the overflow is intentional. (A real bar/label sticking out still flags — those carry text or
    // pointer events.) A model once burned a full 32-step budget against a -right-24 glow's 31px.
    const onlyDecorativeBeyond = (axis) => {
      const r = el.getBoundingClientRect();
      const edge = axis === "x" ? r.left + el.clientLeft + cw : r.top + el.clientTop + ch;
      let sawOffender = false;
      for (const d of el.querySelectorAll("*")) {
        const b = d.getBoundingClientRect();
        const ds = getComputedStyle(d);
        // Two offender shapes: a BOX crossing the ancestor's content edge, or TEXT spilling out of its
        // own box with visible overflow (the nowrap sentence: its 500px box stays inside, the glyphs
        // don't — box-crossing alone misses it and would have skipped a REAL clip).
        const beyondBox = (axis === "x" ? b.right > edge + 3 : b.bottom > edge + 3) && b.width > 0 && b.height > 0;
        // Only a box whose OWN inline text spills counts — an intermediate container "spills" merely
        // because the decorative child inside it crosses its edge; attributing the glow's geometry to
        // the text-bearing wrapper would re-flag the bleed.
        const hasDirectText = [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        const spillsText = hasDirectText && (axis === "x"
          ? ds.overflowX === "visible" && d.scrollWidth - d.clientWidth > 3
          : ds.overflowY === "visible" && d.scrollHeight - d.clientHeight > 3);
        if (!beyondBox && !spillsText) continue;
        sawOffender = true;
        if ((d.textContent || "").trim() || ds.pointerEvents !== "none") return false;
      }
      return sawOffender; // all offenders decorative → intentional bleed
    };
    if (/(hidden|clip|auto|scroll)/.test(s.overflowX) && cw > 0 && el.scrollWidth - cw > 3 && !onlyDecorativeBeyond("x"))
      clipped.push({ el: elLabel(el), axis: "x", overflowPx: el.scrollWidth - cw, ...(hasNowrap(el) ? { nowrap: true } : {}) });
    if (/(hidden|clip|auto|scroll)/.test(s.overflowY) && ch > 0 && el.scrollHeight - ch > 3 && !onlyDecorativeBeyond("y"))
      clipped.push({ el: elLabel(el), axis: "y", overflowPx: el.scrollHeight - ch });
  }
  // SVG <text> clipped by its viewBox (e.g. a left-anchored "100%" axis label whose
  // leading digit falls outside the viewBox). DOM scroll metrics don't apply to SVG.
  for (const txt of canvas.querySelectorAll("svg text")) {
    const svg = txt.closest("svg");
    if (!svg) continue;
    const tr = txt.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    if (tr.width < 1) continue;
    const lbl = (txt.textContent || "").trim().slice(0, 24) || "svg-text";
    if (tr.left < sr.left - 1) clipped.push({ el: JSON.stringify(lbl), axis: "x", overflowPx: Math.round(sr.left - tr.left) });
    else if (tr.right > sr.right + 1) clipped.push({ el: JSON.stringify(lbl), axis: "x", overflowPx: Math.round(tr.right - sr.right) });
  }

  // ── PL-6 R1 — text-vs-stroke OCCLUSION (point-sampled, NOT bbox) ──────────────
  // Flags a stroked graphic (a <path>/<line>/<polyline>/<polygon> curve) drawn THROUGH
  // the interior of a text label so the lettering is bisected/covered (unreadable). The
  // gate runs on BOTH paths and feeds Path B's self-correction loop, so the binding
  // constraint is ZERO FALSE POSITIVES: an axis line / gridline / tick under a label, a
  // connector that grazes a label's edge, a quadrant divider behind a point label, a box-
  // plot whisker beside a value, or a series' own same-colour end-label must NOT flag.
  // The four discriminators that make a flag a TRUE "a curve is drawn through the text":
  //   1. THICK stroke (≥2.5px) — chart DATA curves are thick; gridlines/ticks/axes/whiskers/
  //      box-outlines/dividers are all hairlines (≤2px) → excluded by width.
  //   2. SATURATED accent colour — the project draws ALL chrome (grid/axis/tick/divider/
  //      baseline/marker) in the neutral graphite (rgb(184,178,167) & its alphas, sat≈0.09);
  //      only meaning-carrying DATA strokes are saturated accents (sat≥0.22) → chrome excluded.
  //   3. Not the text's own decoration — excluded if the stroke is the text's ancestor/
  //      descendant, shares its nearest <g>, or is ~the text's own colour (a same-colour line
  //      at a label's own end-point — the universal LineChart/Area end-label-on-its-line case).
  //   4. The stroke CROSSES THE INSET CORE (centred 68%) on ≥3 samples — a glancing edge
  //      touch (a label sitting at a line terminus) lands < this.
  //
  // Coordinate spaces: the stroke geometry lives in SVG user units; getScreenCTM() maps a
  // user-space point to viewport CSS px (the SAME frame as getBoundingClientRect), and we
  // subtract cb.left/cb.top to land in the canvas-local CSS px the text boxes already use.
  const OCC_INSET = 0.68; // core = centred 68% of the box's W and H (ignore the edges)
  const OCC_MIN_HITS = 3; // need ≥3 samples inside the core (a glancing touch is < this)
  const OCC_MIN_STROKE_W = 2.5; // chart DATA curves are thick; chrome hairlines (≤2px) excluded
  const OCC_MIN_OPACITY = 0.5; // a faint/ghost stroke doesn't render over the lettering
  const OCC_MIN_SAT = 0.22; // only a SATURATED accent occludes; neutral chrome (grid/axis) excluded
  // DEEP-SWEEP override: even a same-<g>/same-colour stroke (a series' own end-label decoration) is a
  // legibility defect if the stroke runs HORIZONTALLY THROUGH the lettering for a long span (a line
  // drawn straight along/through its own flat-line label, vs a label sitting at the line's terminus —
  // a small corner clip). Measured: across all 122 clean fixtures the max own-colour core x-span is
  // 34px (a terminus clip); the incentives B defect (cyan/amber line through its own end-label) is
  // 155px. The 75px gate sits safely between, so the override never flags a clean fixture.
  const OCC_SWEEP_SPAN = 75;
  // ANGLED-CROSS-THROUGH override (PL-6) — the blind spot the deep-sweep (a HORIZONTAL run) misses:
  // a data curve that crosses a WIDE same-colour end-label at an ANGLE (the honest-factor LineChart —
  // the series description is baked into the end-label `"93% (Honest: 'I'm not sure')"`, so the box
  // extends far LEFT across the plot, and the rising/falling curve bisects the words). Such a crossing
  // clips the label's EDGES, lands < OCC_MIN_HITS in the centred core, and is NOT a horizontal sweep —
  // so both existing rules miss it. Two INDEPENDENT full-box signals (AND'd for a safe margin):
  //   • OCC_THROUGH_HITS  — samples landing in the box INTERIOR (≥ a stroke-width in from every edge),
  //     i.e. a stroke genuinely drawn THROUGH the body, not grazing an edge/corner.
  //   • OCC_THROUGH_LEFT  — how far IN from the box's LEFT edge the leftmost in-box sample reaches.
  //     A legitimate end-label is touched only near its RIGHT terminus (the end-dot at WIDTH−12) where
  //     the value sits; a curve crossing the label BODY reaches deep from the left.
  // Calibration (motion-on sweep over the renderfuzz corpus, t=1, own-colour curves only):
  //   honest-factor: interior 13 & 20, leftReach 141 & 62 px  →  must FLAG.
  //   widest CLEAN end-label-on-its-line (fuzz-63 area "82% (active agents)"): interior 11, leftReach 37 px.
  //   every other clean own-colour label: interior ≤ 11, leftReach ≤ 37 px.
  // The 12-hit / 48-px floors sit in the gap on BOTH axes (clean-max 11 & 37); requiring BOTH keeps a
  // comfortable double margin, so the override adds the honest-factor coverage with zero new FP.
  const OCC_THROUGH_HITS = 12;
  const OCC_THROUGH_LEFT = 48;
  const OCC_MAX_SAMPLES = 500;
  const rgbOf = (c) => { const m = (c || "").match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const saturation = (c) => { const a = rgbOf(c); if (!a) return 0; const mx = Math.max(a[0], a[1], a[2]); return mx === 0 ? 0 : (mx - Math.min(a[0], a[1], a[2])) / mx; };
  const colorClose = (c1, c2) => { // ~same colour → could be emphasis / a same-colour end-label-on-line
    const a = rgbOf(c1), b = rgbOf(c2);
    if (!a || !b) return false;
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 60;
  };
  const nearestG = (el) => { for (let n = el; n; n = n.parentElement) { if (n.tagName && n.tagName.toLowerCase() === "g") return n; } return null; };
  // the text's effective PAINT colour: SVG <text>/<tspan> is painted by `fill`, HTML by `color`.
  // (m.color stores the CSS `color`, which for SVG text is the inherited value, NOT the visible fill —
  // so a cyan area edge over its own cyan end-label would slip past the same-colour exclusion.)
  const paintOf = (el) => {
    const s = getComputedStyle(el);
    const ns = (el.namespaceURI || "").includes("svg") || el.closest && el.closest("svg");
    if (ns && s.fill && s.fill !== "none") return s.fill;
    return s.color;
  };

  const textOccluded = [];
  // A label carrying its OWN readability backing — a dark, contrasting halo painted UNDER the glyphs
  // (paint-order:stroke + a near-background stroke ≥ ~5px) — stays legible over ANY fill/line by design
  // (the area annotation + end labels use exactly this). The occlusion scan is geometric (does a path
  // cross the box), so without this it would flag a label that is in fact perfectly readable. Exempt it:
  // the halo restores contrast, which is the whole thing the "occluded = unreadable" gate protects.
  const hasBackingHalo = (el) => {
    if (!el || typeof el.getAttribute !== "function") return false;
    const s = getComputedStyle(el);
    const po = (s.paintOrder || el.getAttribute("paint-order") || "").trim();
    if (!po.startsWith("stroke")) return false;
    const sw = parseFloat(s.strokeWidth) || 0;
    if (sw < 5) return false;
    const st = s.stroke;
    if (!st || st === "none") return false;
    const rgb = (st.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    if (rgb.length < 3) return false;
    return (rgb[0] + rgb[1] + rgb[2]) / 3 < 60; // near-background dark ink (e.g. #0E1116) → a true halo
  };
  // text targets: the genuine text leaves (SVG <text> + HTML), with their canvas-local box.
  const occTargets = measured.filter((m) => m.text && m.text.length > 0 && m.rect.w > 4 && m.rect.h > 4 && !hasBackingHalo(m._el));
  if (occTargets.length) {
    const strokeEls = [...canvas.querySelectorAll("path, line, polyline, polygon")].filter((el) => {
      if (!visible(el)) return false;
      const s = getComputedStyle(el);
      if (!s.stroke || s.stroke === "none") return false;
      if ((parseFloat(s.strokeWidth) || 0) < OCC_MIN_STROKE_W) return false;
      const op = (parseFloat(s.opacity) || 1) * (parseFloat(s.strokeOpacity) || 1);
      if (op < OCC_MIN_OPACITY) return false;
      if (saturation(s.stroke) < OCC_MIN_SAT) return false; // neutral chrome (grid/axis/tick/divider) never occludes
      return true;
    });
    for (const sEl of strokeEls) {
      const ctm = typeof sEl.getScreenCTM === "function" ? sEl.getScreenCTM() : null;
      if (!ctm) continue;
      // sample the geometry in user space → canvas-local CSS px.
      const pts = [];
      const pushUser = (ux, uy) => {
        const x = ctm.a * ux + ctm.c * uy + ctm.e - cb.left;
        const y = ctm.b * ux + ctm.d * uy + ctm.f - cb.top;
        pts.push({ x, y });
      };
      const tag = sEl.tagName.toLowerCase();
      try {
        if (tag === "line") {
          const x1 = +sEl.getAttribute("x1"), y1 = +sEl.getAttribute("y1");
          const x2 = +sEl.getAttribute("x2"), y2 = +sEl.getAttribute("y2");
          if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) continue;
          const len = Math.hypot(x2 - x1, y2 - y1);
          const n = Math.max(2, Math.min(OCC_MAX_SAMPLES, Math.ceil(len / 3.5)));
          for (let i = 0; i <= n; i++) { const f = i / n; pushUser(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); }
        } else if (typeof sEl.getTotalLength === "function" && typeof sEl.getPointAtLength === "function") {
          const total = sEl.getTotalLength();
          if (!Number.isFinite(total) || total < 1) continue;
          const n = Math.max(2, Math.min(OCC_MAX_SAMPLES, Math.ceil(total / 3.5)));
          for (let i = 0; i <= n; i++) { const p = sEl.getPointAtLength((total * i) / n); pushUser(p.x, p.y); }
        } else continue;
      } catch { continue; }
      if (!pts.length) continue;

      const sStroke = getComputedStyle(sEl).stroke;
      const sG = nearestG(sEl);
      const sW = parseFloat(getComputedStyle(sEl).strokeWidth) || OCC_MIN_STROKE_W;
      for (const m of occTargets) {
        // a stroke nested INSIDE the text (its own underline glyph stroke) is never an occluder.
        if (sEl.contains(m._el) || m._el.contains(sEl)) continue;
        const r = m.rect;
        const ix0 = r.x + r.w * (1 - OCC_INSET) / 2, ix1 = r.right - r.w * (1 - OCC_INSET) / 2;
        const iy0 = r.y + r.h * (1 - OCC_INSET) / 2, iy1 = r.bottom - r.h * (1 - OCC_INSET) / 2;
        // CORE samples (centred 68%) → the existing core-hit + horizontal deep-sweep signals.
        // FULL-box samples → the new angled-cross-through signals: `throughHits` = samples in the box
        // INTERIOR (≥ one stroke-width in from every edge, so an edge graze doesn't count), `leftReach`
        // = how far the leftmost in-box sample penetrates from the box's LEFT edge.
        const edgeBand = Math.max(2, sW); // an interior point clears every edge by at least the stroke width
        let hits = 0, minX = Infinity, maxX = -Infinity;
        let throughHits = 0, fullMinX = Infinity;
        for (const p of pts) {
          if (p.x >= ix0 && p.x <= ix1 && p.y >= iy0 && p.y <= iy1) { hits++; if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
          if (p.x >= r.x && p.x <= r.right && p.y >= r.y && p.y <= r.bottom) {
            if (p.x < fullMinX) fullMinX = p.x;
            const edgeDist = Math.min(p.x - r.x, r.right - p.x, p.y - r.y, r.bottom - p.y);
            if (edgeDist > edgeBand) throughHits++;
          }
        }
        const spanX = maxX - minX;
        const leftReach = fullMinX < Infinity ? fullMinX - r.x : 0;
        const isOwn = (sG && sG === nearestG(m._el)) || colorClose(sStroke, paintOf(m._el));
        // A stroke drawn THROUGH the text is a legibility defect via ANY of:
        //   (a) ≥ OCC_MIN_HITS in the centred core (the original foreign-stroke / through-the-middle case);
        //   (b) a HORIZONTAL run ≥ OCC_SWEEP_SPAN across the core (a line along its own flat-line label);
        //   (c) an ANGLED cross-through of a WIDE same-colour label (PL-6) — many interior samples that
        //       also reach deep from the left edge (the honest-factor curve bisecting its own end-label);
        //   (d) a DENSE cross-through of a SHORT same-colour label (PL-6b) — see below.
        // The own-decoration exclusion suppresses (a)'s core hits for a same-colour end-label, so for an
        // own stroke a finding requires (b), (c) OR (d). A foreign stroke flags on (a) as before.
        const angledThrough = throughHits >= OCC_THROUGH_HITS && leftReach >= OCC_THROUGH_LEFT;
        // (d) NARROW-BOX DENSE CROSS-THROUGH (PL-6b) — the blind spot (b) and (c) share on a SHORT box:
        // a decoration (e.g. a mint checkmark) stamped straight THROUGH a short own-colour label (the
        // self-correcting "SHIP" node: check path over the 4-letter label). It racks up interior hits
        // but on a ~50px-wide box can NEVER reach OCC_SWEEP_SPAN (75px core run) NOR OCC_THROUGH_LEFT
        // (48px left-penetration) — both are wide-label thresholds — so both overrides miss it. The
        // interior-hit COUNT alone separates it, scale-free: across the whole renderfuzz corpus the
        // densest CLEAN own end-label graze is 8 interior hits (fuzz-70 "37%", fuzz-54 "38k"); the SHIP
        // checkmark is 15. OCC_THROUGH_HITS (12) sits in the gap with a 4-hit margin under clean-max, so
        // (d) adds the narrow-box coverage with zero new FP. (No leftReach gate — that is the point.)
        const denseThrough = throughHits >= OCC_THROUGH_HITS;
        if (hits < OCC_MIN_HITS && !angledThrough) continue;
        if (isOwn && spanX < OCC_SWEEP_SPAN && !denseThrough) continue;
        textOccluded.push({
          el: label(m),
          text: m.text,
          byRole: sEl.getAttribute("data-inspect") || (sG && sG.getAttribute("data-inspect")) || tag,
          hits,
          spanX: Math.round(spanX),
          throughHits,
          leftReach: Math.round(leftReach),
        });
        break; // one finding per occluded text is enough
      }
    }
  }

  // ── PL-6 — SVG <text> OVERFLOWS its owning filled <rect> "box" ─────────────────
  // The blind spot the `clipped` check can't see: an SVG <text> label crammed into a filled
  // <rect> "chip/box" that is NARROWER than the text paints OUTSIDE the box's border (a visible
  // spill) — but with NO overflow-hidden `scrollHeight/Width` never grows, and (a <rect> carries
  // no text node) the collision scan never compares them. Measured on the self-correcting Path-B
  // defect: the hand-rolled pipeline chips "04 · QA GATE" (13.5px/side) and "03 · ENGINE"
  // (7.2px/side) poke past their 130-wide chips on BOTH sides (the labels are wider than the box).
  //
  // TIGHTEST 0-FP rule — a middle-anchored label wider than its container pokes out BOTH ends:
  //   a filled <rect> R "owns" a <text> T when T's CENTRE is inside R; T overflows R when it pokes
  //   past R on BOTH the left AND right by > OVERFLOW_TOL (⇒ T is strictly wider than R and roughly
  //   centred in it — the unambiguous "text wider than its box" case). SUPPRESSED when T is
  //   horizontally CONTAINED by ANY rect it owns (it has a home that fits), so a decorative pill
  //   narrower on ONE side, "text sitting slightly proud of an edge", or a background LARGER than
  //   its text (T fully inside → no overhang) never flags.
  // Calibration (t=1 sweep over the 131-fixture corpus): EVERY clean fixture scores 0px both-side
  // overhang — incl. every Pipeline (2-char "NN" chips), Taxonomy long-label/overcap chip, Funnel
  // long-label band, and Bar in-bar value label; the ONLY non-zero is the self-correcting defect at
  // 13.5 / 7.2 px. The 6px gate sits squarely in the (0, 13.5) gap → flags the defect, zero corpus FP.
  const OVERFLOW_TOL = 6; // px per side — clean-corpus max is 0px; the defect is 7.2–13.5px/side
  const textOverflowsBox = [];
  {
    const svgTexts = [...canvas.querySelectorAll("svg text")]
      .filter(visible)
      .filter((el) => (el.textContent || "").trim().length > 0);
    const svgRects = [...canvas.querySelectorAll("svg rect")].filter((el) => {
      if (!visible(el)) return false;
      const s = getComputedStyle(el);
      if (!s.fill || s.fill === "none") return false; // an unfilled rect is not a "box"
      if ((parseFloat(s.fillOpacity) || 1) < 0.05) return false; // a near-transparent wash isn't a container
      const a = (s.fill.match(/[\d.]+/g) || []).map(Number);
      if (a.length === 4 && a[3] === 0) return false; // fully-transparent fill
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4; // ignore clip/defs zero-boxes
    });
    if (svgRects.length) {
      const rectBoxes = svgRects.map((el) => toLocal(el.getBoundingClientRect()));
      for (const tEl of svgTexts) {
        const tr = toLocal(tEl.getBoundingClientRect());
        if (tr.w <= 4 || tr.h <= 4) continue;
        const tcx = tr.x + tr.w / 2, tcy = tr.y + tr.h / 2;
        // owners: filled rects whose interior contains the text's centre (the box the text sits in).
        const owners = rectBoxes.filter((r) => tcx >= r.x && tcx <= r.right && tcy >= r.y && tcy <= r.bottom);
        if (!owners.length) continue;
        // has a fitting home? any owning rect that horizontally CONTAINS the whole text → not overflow.
        if (owners.some((r) => tr.x >= r.x - 0.5 && tr.right <= r.right + 0.5)) continue;
        // best-fitting owner = the one with the smallest both-side overhang (the tightest container).
        let best = null;
        for (const r of owners) {
          const leftOver = r.x - tr.x, rightOver = tr.right - r.right;
          if (leftOver > 0 && rightOver > 0) {
            const both = Math.min(leftOver, rightOver);
            if (!best || both < best.both) best = { both, leftOver, rightOver, r };
          }
        }
        if (best && best.both > OVERFLOW_TOL) {
          textOverflowsBox.push({
            el: (tEl.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32),
            overflowPx: Math.round(best.both),
            leftPx: Math.round(best.leftOver),
            rightPx: Math.round(best.rightOver),
            boxWidthPx: Math.round(best.r.w),
          });
        }
      }
    }
  }

  // UNLABELED CATEGORICAL MARKS — a HAND-ROLLED chart where each data mark is a distinct CATEGORY (bar,
  // funnel stage, pie/donut wedge) but some marks carry NO label at all is misleading: you can't read them.
  // Every PRIMITIVE labels each mark by construction, so this only ever fires on model-authored bespoke
  // charts (the blind spot behind "3 of 6 bars shipped with no value"). Line/scatter are DELIBERATELY
  // excluded — the axis carries their values and not every point is labelled. Conservative + WARN-grade:
  // each mark KIND needs ≥N clearly-marks and flags only when ≥40% have no text anywhere they'd be labelled.
  const marksUnlabeled = (() => {
    const texts = [
      ...[...canvas.querySelectorAll("svg text")].filter(visible).filter((el) => (el.textContent || "").trim()).map((el) => toLocal(el.getBoundingClientRect())),
      ...measured.map((m) => toLocal(m._el.getBoundingClientRect())),
    ].filter((t) => t.w > 2 && t.h > 2);
    const accentFill = (s) => {
      if (!s.fill || s.fill === "none") return false;
      if ((parseFloat(s.fillOpacity) || 1) * (parseFloat(s.opacity) || 1) < 0.35) return false;
      return saturation(s.fill) >= 0.18; // neutral chrome / background wash is never a data mark
    };
    // Label proximity per mark shape. A COLUMN label sits over/under a vertical bar; a ROW label sits at a
    // horizontal bar's / funnel stage's height (category on the left, value at the end); an INSIDE label
    // sits within a wedge's box.
    const inColumn = (m) => texts.some((t) => { const cx = t.x + t.w / 2; return cx >= m.x - 14 && cx <= m.right + 14 && t.bottom >= m.y - 46 && t.y <= m.bottom + 46; });
    const inRow = (m) => texts.some((t) => { const cy = t.y + t.h / 2; return cy >= m.y - 10 && cy <= m.bottom + 10; });
    const inside = (m) => texts.some((t) => { const cx = t.x + t.w / 2, cy = t.y + t.h / 2; return cx >= m.x - 8 && cx <= m.right + 8 && cy >= m.y - 8 && cy <= m.bottom + 8; });
    const rects = [...canvas.querySelectorAll("svg rect")].filter(visible)
      .map((el) => ({ s: getComputedStyle(el), r: toLocal(el.getBoundingClientRect()) }))
      .filter(({ s, r }) => accentFill(s) && r.w >= 8 && r.h >= 8);
    const groupBy = (arr, keyFn) => { const m = new Map(); for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m.values()]; };
    const cands = []; // { kind, marks:[box], labeled:fn }
    // VERTICAL bars — share a bottom edge (baseline), heights vary.
    for (const g of groupBy(rects, (b) => Math.round(b.r.bottom / 5)))
      if (g.length >= 4) { const hs = g.map((b) => b.r.h); if (Math.max(...hs) - Math.min(...hs) >= 12) cands.push({ kind: "bar", marks: g.map((b) => b.r), labeled: inColumn }); }
    // HORIZONTAL bars — share a left edge, widths vary (stacked rows).
    for (const g of groupBy(rects, (b) => Math.round(b.r.x / 5)))
      if (g.length >= 4) { const ws = g.map((b) => b.r.w); if (Math.max(...ws) - Math.min(...ws) >= 12) cands.push({ kind: "bar", marks: g.map((b) => b.r), labeled: inRow }); }
    // DONUT / PIE — ≥3 accent PATHS (wedges) that all CONTAIN a common centre point (the hub every wedge's
    // apex touches — a wedge's bbox is offset toward its arc, so their boxes overlap AT the hub, not at a
    // shared bbox centre). A stacked area's bands don't share a hub. Wedge labels sit on/inside the ring.
    const bigPaths = [...canvas.querySelectorAll("svg path")].filter(visible)
      .map((el) => ({ s: getComputedStyle(el), r: toLocal(el.getBoundingClientRect()) }))
      .filter(({ s, r }) => accentFill(s) && r.w >= 30 && r.h >= 30);
    if (bigPaths.length >= 3) {
      const hubX = bigPaths.reduce((a, p) => a + p.r.x + p.r.w / 2, 0) / bigPaths.length;
      const hubY = bigPaths.reduce((a, p) => a + p.r.y + p.r.h / 2, 0) / bigPaths.length;
      // the hub sits at each wedge's APEX — a CORNER of its bbox — so allow the boundary (a small outward margin).
      const wedges = bigPaths.filter((p) => hubX >= p.r.x - 6 && hubX <= p.r.right + 6 && hubY >= p.r.y - 6 && hubY <= p.r.bottom + 6);
      if (wedges.length >= 3) cands.push({ kind: "donut", marks: wedges.map((p) => p.r), labeled: inside });
    }
    // FUNNEL — ≥3 accent polygons/paths STACKED vertically (each begins near where the last ended, gaps
    // allowed) AND NARROWING top→bottom (the funnel shape) — a stacked area's bands overlap in y and don't
    // systematically narrow, so this doesn't catch it. Stage labels sit in each stage's row.
    const stageEls = [...canvas.querySelectorAll("svg polygon, svg path")].filter(visible)
      .map((el) => ({ s: getComputedStyle(el), r: toLocal(el.getBoundingClientRect()) }))
      .filter(({ s, r }) => accentFill(s) && r.w >= 40 && r.h >= 10 && r.h <= 320)
      .sort((a, b) => a.r.y - b.r.y);
    const stack = [];
    for (const p of stageEls) { const last = stack[stack.length - 1]; if (!last || (p.r.y >= last.r.bottom - 30 && p.r.y <= last.r.bottom + 70)) stack.push(p); }
    if (stack.length >= 3 && stack[0].r.w > stack[stack.length - 1].r.w * 1.15)
      cands.push({ kind: "funnel", marks: stack.map((p) => p.r), labeled: inRow });

    let worst = null;
    for (const c of cands) {
      const unlabeled = c.marks.filter((m) => !c.labeled(m)).length;
      if (unlabeled / c.marks.length >= 0.4 && (!worst || unlabeled > worst.unlabeled)) worst = { kind: c.kind, count: c.marks.length, unlabeled };
    }
    return worst;
  })();

  const sigEl = canvas.querySelector('[aria-label^="Creator:"]');
  const signaturePresent = !!sigEl;
  // Effective (cumulative) opacity of the signature — for the motion "visible by 1.2s" check.
  let signatureOpacity = signaturePresent ? 1 : 0;
  for (let n = sigEl; n && n !== document.body; n = n.parentElement) {
    signatureOpacity *= parseFloat(getComputedStyle(n).opacity || "1");
  }
  signatureOpacity = +signatureOpacity.toFixed(3);

  // Full rendered text strings (untruncated) — used by the data-fidelity judge.
  const texts = leaves.map((el) => (el.textContent || "").trim().replace(/\s+/g, " ")).filter(Boolean);

  // ── Generic per-text-leaf ANCHOR boxes (canvas-local px) + cumulative opacity ──
  // Consumed by the multi-frame LAYOUT-STABILITY check (tools/lib/qa.mjs): a settled,
  // static-content label (an axis tick, a category label, the takeaway, the signature) must
  // NOT move between two frames of the animation. When one does, the mid-section's height or
  // a chart's axis scale is a function of `t` — the layout resizes every frame and shoves the
  // footer (the "shaking bars / footer pushed up" defect). The check keys elements by their
  // text across frames, so a count-up value (content differs per frame) never matches, and an
  // element still revealing (opacity < ~0.9) is excluded — only genuinely-settled anchors gate.
  const cumOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
      const ov = parseFloat(getComputedStyle(n).opacity);
      if (Number.isFinite(ov)) o *= ov;
    }
    return o;
  };
  // Whether a CSS transform string ACTIVELY displaces/scales the element (vs a settled identity). A
  // slide/scale entrance mid-flight is a non-identity matrix (e.g. translateX(-8px) ⇒ matrix(1,0,0,1,-8,0));
  // a SETTLED element that merely still carries `transform: translateX(0)` is an identity matrix and must
  // NOT be treated as moving. Tolerate sub-pixel translate + tiny fp error.
  const isDisplacing = (tr) => {
    if (!tr || tr === "none") return false;
    let m = tr.match(/^matrix\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(",").map((v) => parseFloat(v)); // a,b,c,d,e,f
      return !(Math.abs(p[0] - 1) < 1e-3 && Math.abs(p[1]) < 1e-3 && Math.abs(p[2]) < 1e-3 && Math.abs(p[3] - 1) < 1e-3 && Math.abs(p[4]) < 0.5 && Math.abs(p[5]) < 0.5);
    }
    m = tr.match(/^matrix3d\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(",").map((v) => parseFloat(v));
      const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      return !p.every((x, i) => (i === 12 || i === 13 || i === 14 ? Math.abs(x) < 0.5 : Math.abs(x - id[i]) < 1e-3));
    }
    return true; // some other transform-function string we didn't parse → treat as displacing (safe)
  };
  // Whether the element or ANY ancestor (up to the canvas) is ACTIVELY displaced by a transform — i.e. it
  // is mid-animation (a slide/scale/spring entrance). Such an element's PAINTED position
  // (getBoundingClientRect) is moving BY DESIGN, so the layout-stability check must EXCLUDE it: a
  // fully-opaque label whose entrance fade finished before its slide did would otherwise read as "shake".
  // Only genuine LAYOUT reflow (a t-dependent container height pushing the footer — the moved element
  // itself carrying no active transform) then counts. HTML + SVG both report `transform` via getComputedStyle.
  const isTransformed = (el) => {
    for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
      if (isDisplacing(getComputedStyle(n).transform)) return true;
    }
    return false;
  };
  const anchors = measured.map((m) => ({
    text: m.text,
    x: +m.rect.x.toFixed(1),
    y: +m.rect.y.toFixed(1),
    w: +m.rect.w.toFixed(1),
    h: +m.rect.h.toFixed(1),
    opacity: +cumOpacity(m._el).toFixed(3),
    transformed: isTransformed(m._el),
  }));

  // ── Q1 deterministic design checks ──────────────────────────────────────────
  // Visual hierarchy: largest display text vs median body text.
  const sizes = measured.map((m) => m.fontSize).sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const maxSize = sizes.length ? sizes[sizes.length - 1] : 0;
  const hierarchyRatio = median ? +(maxSize / median).toFixed(2) : 0;

  // Typographic polish: literal caret exponents / double hyphens in display text.
  const typo = [];
  for (const m of measured) {
    if (/\^\d/.test(m.text)) typo.push({ el: m.text, issue: "literal caret exponent — use a superscript (e.g. ¹⁰)" });
    if (/(^|\s)--(\s|$)/.test(m.text)) typo.push({ el: m.text, issue: "double hyphen — use an em dash (—)" });
  }

  // Duplicate display strings (short strings / numbers rendered more than once).
  const counts = {};
  for (const t of texts) if (t.length >= 2 && t.length <= 12) counts[t] = (counts[t] || 0) + 1;
  const duplicates = Object.entries(counts).filter(([, n]) => n >= 2).map(([text, count]) => ({ text, count }));

  // Bottom platform-reserve (80px) — non-signature content should clear it.
  const bottomReserve = [];
  for (const m of measured) {
    if (inSignature(m._el)) continue;
    if (m.rect.bottom > H - 80 && m.rect.bottom <= H - 64 + 0.5)
      bottomReserve.push({ el: label(m), byPx: Math.round(m.rect.bottom - (H - 80)) });
  }

  // Balance: text center-of-mass offset from canvas center (fraction of dimension).
  let cmx = 0, cmy = 0, cArea = 0;
  for (const m of measured) {
    const a = m.rect.w * m.rect.h;
    cmx += (m.rect.x + m.rect.w / 2) * a; cmy += (m.rect.y + m.rect.h / 2) * a; cArea += a;
  }
  const balanceX = cArea ? +(((cmx / cArea) - W / 2) / W).toFixed(3) : 0;
  const balanceY = cArea ? +(((cmy / cArea) - H / 2) / H).toFixed(3) : 0;

  // Anti-monochrome: count distinct saturated accent hues across text + svg strokes.
  const hueBucket = (color) => {
    const m = (color.match(/[\d.]+/g) || []).map(Number);
    const [r, g, b] = m;
    if (r == null) return null;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2 / 255, s = mx === 0 ? 0 : d / mx;
    if (s < 0.22 || l < 0.12 || l > 0.92) return null; // neutral / near-white / dark
    let h;
    if (d === 0) h = 0;
    else if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return Math.round((h * 60) / 30); // 30° buckets
  };
  const hues = new Set();
  for (const m of measured) { const h = hueBucket(m.color); if (h != null) hues.add(h); }
  for (const el of canvas.querySelectorAll("svg *")) {
    const st = getComputedStyle(el);
    if (st.stroke && st.stroke !== "none") { const h = hueBucket(st.stroke); if (h != null) hues.add(h); }
  }
  const accentHues = hues.size;

  // Density proxies (objective measures of crowding):
  //  - textCoverage: fraction of the canvas covered by text boxes.
  //  - crampedPairs: adjacent text elements separated by an uncomfortably small gap.
  let textArea = 0;
  for (const m of measured) textArea += Math.max(0, m.rect.w) * Math.max(0, m.rect.h);
  const textCoverage = +(textArea / (W * H)).toFixed(3);

  let crampedPairs = 0;
  for (let a = 0; a < measured.length; a++) {
    for (let b = a + 1; b < measured.length; b++) {
      const A = measured[a].rect, B = measured[b].rect;
      const xOverlap = Math.min(A.right, B.right) - Math.max(A.x, B.x);
      const yOverlap = Math.min(A.bottom, B.bottom) - Math.max(A.y, B.y);
      if (xOverlap > 8) {
        const gap = Math.max(A.y, B.y) - Math.min(A.bottom, B.bottom);
        if (gap > 0 && gap < 14) crampedPairs++;
      } else if (yOverlap > 8) {
        const gap = Math.max(A.x, B.x) - Math.min(A.right, B.right);
        if (gap > 0 && gap < 14) crampedPairs++;
      }
    }
  }
  // Gate on coverage: clean designs ~0.20–0.25, a dense-but-acceptable one ~0.39, an over-packed
  // layout ~0.47. The 0.42 threshold was calibrated on PORTRAIT (4:5, W/H≈0.8). A SHORTER canvas
  // (square 1:1) legitimately fills a bigger area fraction with equivalent content and bigger type, so
  // the cap must RISE for it or valid square layouts get rejected as "over-crowded" at ERROR severity
  // and never converge. But it must NEVER drop below the tuned 0.42 for a TALLER frame (vertical 9:16,
  // W/H≈0.56) — doing so wrongly fails legitimate ~34% vertical content. So: raise for shorter, floor at
  // 0.42. 0.525·(W/H) ⇒ 0.42 at 4:5, ~0.52 at 1:1; max(0.42,·) keeps 9:16 at 0.42; min(0.55,·) caps it.
  // Square (1:1) gets an explicitly RAISED band (0.55, was 0.525 via the formula): the short frame is
  // ACCEPTED to pack denser than the other aspects (Emil's call) — the mobile floors + collision +
  // overflow gates still bound it, so "denser" can never mean "unreadable". Portrait stays at the
  // calibrated 0.42; vertical keeps the 0.42 floor.
  // Floor 0.43 (was 0.42): the vertical-fill bottom cards are intentionally taller/denser, nudging
  // portrait's text-coverage baseline up a hair — still far below the ~0.47 over-packed reference, so
  // genuinely crowded layouts still fail. Square keeps its explicit 0.55 band; vertical floors at 0.43.
  const arRatio = W / H;
  const crowdedCap = arRatio >= 0.95 ? 0.55 : Math.min(0.55, Math.max(0.43, 0.525 * arRatio));
  const crowded = textCoverage > crowdedCap;

  // ── PL-1.1 count-up geometry ────────────────────────────────────────────────
  // Per-MetricCard card bbox, FitLine zone width, applied zoom, and the value text's
  // actual advance width (via a Range — the overlay is inset:0, so its own bbox is the
  // reserved box, not the text). Sampled across `t` by tools/qa-countup.mjs to assert
  // the C9/C10 width-stability invariants ("animation reserve" check row).
  const metricCards = [...canvas.querySelectorAll("[data-metric-card]")].map((card) => {
    const zone = card.querySelector("[data-metric-value] > div"); // FitLine's zone div
    const fitSpan = zone ? zone.firstElementChild : null; // FitLine's zoomed span
    const valueEl = card.querySelector("[data-metric-value-text]");
    let valueTextWidth = 0;
    if (valueEl) {
      const rg = document.createRange();
      rg.selectNodeContents(valueEl);
      valueTextWidth = rg.getBoundingClientRect().width;
    }
    // PL-4.2 deltaTrend (additive, metric-scoped — sibling-safe): the delta row's computed color +
    // author trend, for qa-countup's color-mapping check. null when the card carries no delta text.
    const deltaEl = card.querySelector("[data-metric-delta]");
    return {
      index: card.getAttribute("data-metric-card"),
      mode: card.getAttribute("data-countup") || null,
      rect: toLocal(card.getBoundingClientRect()),
      zoneWidth: zone ? +zone.getBoundingClientRect().width.toFixed(2) : 0,
      zoom: fitSpan ? parseFloat(getComputedStyle(fitSpan).zoom) || 1 : 1,
      valueText: valueEl ? valueEl.textContent : null,
      valueTextWidth: +valueTextWidth.toFixed(2),
      delta: deltaEl
        ? {
            text: (deltaEl.textContent || "").trim(),
            color: getComputedStyle(deltaEl).color,
            trend: deltaEl.getAttribute("data-delta-trend"),
            rect: toLocal(deltaEl.getBoundingClientRect()),
          }
        : null,
    };
  });

  // ── PL-1.2 StatHero geometry ────────────────────────────────────────────────
  // Dual view of the stat centerpiece for the §2.7 geometry check (tools/qa-stathero.mjs):
  // LAYOUT via offset* (transform-blind — the scale-pop must never move the layout box)
  // and PAINTED via getBoundingClientRect (must stay inside the C6 envelope). The ring
  // SVG has no offset* (SVG element), so its layout box is the 320×320 ring-box div.
  const statHero = (() => {
    const w = canvas.querySelector("[data-stat-hero]");
    if (!w) return null;
    const zone = canvas.querySelector("[data-stat-value] > div"); // FitLine's zone div
    const fitSpan = zone ? zone.firstElementChild : null; // FitLine's zoomed span
    const ghost = canvas.querySelector("[data-stat-ghost]");
    const valueEl = canvas.querySelector("[data-stat-value-text]");
    const ringBox = canvas.querySelector("[data-stat-ring-box]");
    const ringSvg = canvas.querySelector("[data-stat-ring-svg]");
    const arc = canvas.querySelector("[data-stat-ring-arc]");
    const sub = canvas.querySelector("[data-stat-sub]");
    const note = canvas.querySelector("[data-stat-note]");
    const root = canvas.querySelector("[data-stat-root]");
    // Cumulative offset* up the offsetParent chain: transform-blind (offset* ignores CSS
    // transforms) AND reference-frame stable — a transformed ancestor becomes an
    // offsetParent boundary mid-pop, so single-hop offsetTop would flip reference frames
    // between samples even though the layout box never moved.
    const offsets = (el) => {
      if (!el) return null;
      let left = 0, top = 0;
      for (let n = el; n; n = n.offsetParent) { left += n.offsetLeft; top += n.offsetTop; }
      return { left, top, width: el.offsetWidth, height: el.offsetHeight };
    };
    const rect = (el) => (el ? toLocal(el.getBoundingClientRect()) : null);
    const opacityOf = (el) => (el ? parseFloat(getComputedStyle(el).opacity) : null);
    let valueTextWidth = 0;
    if (valueEl) {
      const rg = document.createRange();
      rg.selectNodeContents(valueEl);
      valueTextWidth = +rg.getBoundingClientRect().width.toFixed(2);
    }
    return {
      mode: w.getAttribute("data-stat-hero"), // "ring" | "plain"
      countMode: w.getAttribute("data-stat-mode"), // "count" | "fade"
      transform: getComputedStyle(w).transform, // "none" or matrix(a,b,c,d,e,f)
      opacity: opacityOf(w),
      zoom: fitSpan ? parseFloat(getComputedStyle(fitSpan).zoom) || 1 : 1,
      layout: {
        wrapper: offsets(w),
        zone: offsets(zone),
        ghost: offsets(ghost),
        ringBox: offsets(ringBox),
        sub: offsets(sub),
        note: offsets(note),
      },
      painted: {
        wrapper: rect(w),
        ringSvg: rect(ringSvg),
        sub: rect(sub),
        note: rect(note),
        panelContent: root && root.parentElement ? rect(root.parentElement) : null,
      },
      valueText: valueEl ? valueEl.textContent : null,
      valueTextWidth,
      subOpacity: opacityOf(sub),
      noteOpacity: opacityOf(note),
      ring: arc
        ? {
            f: parseFloat(ringSvg.getAttribute("data-ring-f")),
            dasharray: parseFloat(getComputedStyle(arc).strokeDasharray),
            dashoffset: parseFloat(getComputedStyle(arc).strokeDashoffset),
          }
        : null,
    };
  })();

  // ── PL-1.3 DecompBar geometry ───────────────────────────────────────────────
  // Bar rect, per-segment rects, fill rects + computed transform, label rects/text/
  // font-size/opacity + true advance width (via a Range — the painted glyph run, not the
  // flex box) and containment truncation. Sampled across `t` by tools/qa-decompbar.mjs to
  // assert C7 (geometry static), C8 (fill ⊆ segment, transform discipline), C4/C5
  // (label-fits-segment) and C11 (settle / transform omitted).
  const decompBar = (() => {
    const bar = canvas.querySelector("[data-decomp-bar]");
    if (!bar) return null;
    const segments = [...bar.querySelectorAll("[data-decomp-seg]")].map((seg) => {
      const fill = seg.querySelector("[data-decomp-fill]");
      const labelEl = seg.querySelector("[data-decomp-label]");
      let label = null;
      if (labelEl) {
        const ls = getComputedStyle(labelEl);
        const rg = document.createRange();
        rg.selectNodeContents(labelEl);
        label = {
          rect: toLocal(labelEl.getBoundingClientRect()),
          text: labelEl.textContent,
          fontSize: parseFloat(ls.fontSize),
          transform: ls.transform,
          opacity: parseFloat(ls.opacity),
          textWidth: +rg.getBoundingClientRect().width.toFixed(2),
          clippedPx: labelEl.scrollWidth - labelEl.clientWidth,
        };
      }
      return {
        index: seg.getAttribute("data-decomp-seg"),
        rect: toLocal(seg.getBoundingClientRect()),
        fill: fill
          ? {
              rect: toLocal(fill.getBoundingClientRect()),
              transform: getComputedStyle(fill).transform,
              color: getComputedStyle(fill).backgroundColor,
            }
          : null,
        label,
      };
    });
    return {
      rect: toLocal(bar.getBoundingClientRect()),
      nodeCount: bar.querySelectorAll("*").length,
      segments,
    };
  })();

  // ── PL-1.4 ClaimList geometry ───────────────────────────────────────────────
  // Per-entry layout box (header / claim / reality line) + the × kill marker. The
  // reveal animates opacity (entry) + translateX (entry slide-in) + the ×'s scale ONLY;
  // every layout box must be geometrically constant across `t` (LC2). LAYOUT is read
  // transform-blind via cumulative offset* (the slide-in translateX and the × scale are
  // CSS transforms — getBoundingClientRect SEES them, so a mid-reveal bbox would falsely
  // "drift"; offset* ignores transforms, giving the stable layout box LC2 constrains).
  // Sampled across `t` by tools/qa-reveal.mjs.
  const claimList = (() => {
    const root = canvas.querySelector("[data-claim-list]");
    if (!root) return null;
    const layoutOf = (el) => {
      if (!el) return null;
      let left = 0, top = 0;
      for (let n = el; n; n = n.offsetParent) { left += n.offsetLeft; top += n.offsetTop; }
      return { x: +left.toFixed(2), y: +top.toFixed(2), w: el.offsetWidth, h: el.offsetHeight };
    };
    const probe = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { layout: layoutOf(el), rect: toLocal(el.getBoundingClientRect()), opacity: parseFloat(s.opacity), transform: s.transform };
    };
    const entries = [...root.querySelectorAll("[data-claim-entry]")].map((entry) => {
      const header = entry.querySelector("[data-claim-header]");
      const claim = entry.querySelector("[data-claim-claim]");
      const claimSpan = entry.querySelector("[data-claim-text-span]"); // inline-block text box (RC7)
      const strike = entry.querySelector("[data-claim-strike]"); // Rev B strike line (RC7/RC9)
      const reality = entry.querySelector("[data-claim-reality]");
      const kill = entry.querySelector("[data-claim-kill]");
      return {
        index: entry.getAttribute("data-claim-entry"),
        entry: probe(entry),
        header: probe(header),
        claim: claim ? { ...probe(claim), text: claim.textContent.trim(), fontSize: parseFloat(getComputedStyle(claim).fontSize) } : null,
        // claimSpan: the inline-block span the strike overlays (its painted rect bounds the words).
        claimSpan: claimSpan ? { rect: toLocal(claimSpan.getBoundingClientRect()) } : null,
        // strike: the Rev B strike-through line — painted rect (transform-aware: scaleX shrinks
        // the painted box from origin-left) + computed transform, for the RC7 box-⊆-claim-span
        // and RC9 settle checks.
        strike: strike
          ? { rect: toLocal(strike.getBoundingClientRect()), transform: getComputedStyle(strike).transform }
          : null,
        reality: probe(reality),
        kill: kill
          ? { ...probe(kill), fontSize: parseFloat(getComputedStyle(kill).fontSize) }
          : null,
      };
    });
    return { rect: toLocal(root.getBoundingClientRect()), nodeCount: root.querySelectorAll("*").length, entries };
  })();

  // ── PL-1.5 ComparisonColumns geometry ───────────────────────────────────────
  // Two-column grid (left = good/cool, right = friction/warm); each column ≤4 items
  // (icon + text). The reveal animates per-column + per-item opacity + translateX (+ a
  // bounded icon scale) ONLY; every item box must be geometrically constant across `t`
  // (CC2). LAYOUT transform-blind via cumulative offset* (the slide-in/icon-pop are CSS
  // transforms). Sampled across `t` by tools/qa-reveal.mjs.
  const comparison = (() => {
    const root = canvas.querySelector("[data-cmp]");
    if (!root) return null;
    const layoutOf = (el) => {
      if (!el) return null;
      let left = 0, top = 0;
      for (let n = el; n; n = n.offsetParent) { left += n.offsetLeft; top += n.offsetTop; }
      return { x: +left.toFixed(2), y: +top.toFixed(2), w: el.offsetWidth, h: el.offsetHeight };
    };
    const columns = [...root.querySelectorAll("[data-cmp-col]")].map((col) => {
      const items = [...col.querySelectorAll("[data-cmp-item]")].map((item) => {
        const icon = item.querySelector("[data-cmp-icon]");
        const txt = item.querySelector("[data-cmp-text]");
        const is = icon ? getComputedStyle(icon) : null;
        const ts = txt ? getComputedStyle(txt) : null;
        return {
          layout: layoutOf(item),
          rect: toLocal(item.getBoundingClientRect()),
          opacity: parseFloat(getComputedStyle(item).opacity),
          transform: getComputedStyle(item).transform,
          icon: icon ? { rect: toLocal(icon.getBoundingClientRect()), transform: is.transform, color: is.color } : null,
          text: txt ? { text: txt.textContent.trim(), fontSize: parseFloat(ts.fontSize), rect: toLocal(txt.getBoundingClientRect()) } : null,
        };
      });
      // Rev B weighting (CC8): the column's own panel background + any burnt wash overlay.
      // `bg` is the Panel root's computed backgroundColor; `wash` is the optional full-panel
      // burnt overlay's backgroundColor (present only on the friction column). The asymmetry
      // (bad col has a wash / border, good col does not) is the CC8 signal.
      const cs = getComputedStyle(col);
      const washEl = col.querySelector("[data-cmp-wash]");
      return {
        side: col.getAttribute("data-cmp-col"), // "left" | "right"
        layout: layoutOf(col),
        rect: toLocal(col.getBoundingClientRect()),
        opacity: parseFloat(getComputedStyle(col).opacity),
        transform: getComputedStyle(col).transform,
        bg: cs.backgroundColor,
        borderColor: cs.borderTopColor,
        borderWidth: parseFloat(cs.borderTopWidth) || 0,
        wash: washEl ? getComputedStyle(washEl).backgroundColor : null,
        items,
      };
    });
    return { rect: toLocal(root.getBoundingClientRect()), nodeCount: root.querySelectorAll("*").length, columns };
  })();

  // ── PL-3.1 Divergence geometry ──────────────────────────────────────────────
  // SVG viewBox primitive (like RangeBars). Reports the svg rect + axis line, per-row dot
  // centers + radii + computed transform, connector path endpoints + drawn length, endpoint-
  // label rects/text/size/opacity, and row-label rects. Sampled across `t` by
  // tools/qa-divergence.mjs to assert C9 (geometry static), C10 (connector & dots in band),
  // C11 (no shared-axis label overlap), and C12 (settle / transform omitted).
  const divergence = (() => {
    const svg = canvas.querySelector("[data-diverge]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    // viewBox → CSS scale factor (the inspector measures CSS px; assertions divide back out
    // when comparing to source-px constants, but geometry-static is checked in CSS px directly).
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const rowOf = (g) => {
      const dots = [...g.querySelectorAll("[data-diverge-dot]")].map((d) => {
        const circle = d.querySelector("circle");
        const cb2 = circle.getBoundingClientRect();
        return {
          // painted center in canvas-local CSS px
          cx: +(cb2.left + cb2.width / 2 - cb.left).toFixed(2),
          cy: +(cb2.top + cb2.height / 2 - cb.top).toFixed(2),
          rx: +(cb2.width / 2).toFixed(2),
          transform: getComputedStyle(d).transform,
        };
      });
      const connEl = g.querySelector("[data-diverge-connector]");
      const conn = connEl
        ? {
            x1: +connEl.getAttribute("x1"),
            y1: +connEl.getAttribute("y1"),
            x2: +connEl.getAttribute("x2"),
            y2: +connEl.getAttribute("y2"),
            rect: localOf(connEl),
          }
        : null;
      const endLabels = [...g.querySelectorAll("[data-diverge-endlabel]")].map((t2) => ({
        text: t2.textContent,
        rect: localOf(t2),
        fontSize: parseFloat(getComputedStyle(t2).fontSize),
        opacity: parseFloat(getComputedStyle(t2).opacity),
      }));
      const rowLabelEl = g.querySelector("[data-diverge-rowlabel]");
      return {
        index: g.getAttribute("data-diverge-row"),
        dots,
        connector: conn,
        endLabels,
        rowLabel: rowLabelEl
          ? { text: rowLabelEl.textContent, rect: localOf(rowLabelEl), fontSize: parseFloat(getComputedStyle(rowLabelEl).fontSize) }
          : null,
      };
    };
    const rows = [...svg.querySelectorAll("[data-diverge-row]")].map(rowOf);
    const axisEl = svg.querySelector("[data-diverge-axis] line");
    return {
      mode: svg.getAttribute("data-diverge-mode"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      axis: axisEl ? { x1: +axisEl.getAttribute("x1"), x2: +axisEl.getAttribute("x2"), y: +axisEl.getAttribute("y1") } : null,
      rows,
    };
  })();

  // ── PL-3.2 TierStack geometry ───────────────────────────────────────────────
  // Stack rect + node count (mount/unmount detector), per-tier band rects + label
  // rect/text/size, per-chip rects + FitLine zoom + text + opacity + transform + rank ordinal.
  // Sampled across `t` by tools/qa-tiers.mjs to assert C11 (geometry static), the NEW
  // tier-contains-items / no-item-overlap / total-count-cap rows, and C13 (settle / transform
  // omitted). All measured in canvas-local CSS px (the FitLine zoom is read off the zoomed span).
  const tiers = (() => {
    const stack = canvas.querySelector("[data-tiers]");
    if (!stack) return null;
    // Transform-blind layout box: cumulative offset* up the offsetParent chain. The chip/label
    // reveal animates a `rise` translateY (a CSS transform) — getBoundingClientRect SEES it, so a
    // mid-reveal bbox would falsely "drift"; offset* IGNORES transforms, giving the stable layout
    // box C11 actually constrains (geometry = pure function of DATA, never `t`).
    const layout = (el) => {
      let left = 0, top = 0;
      for (let n = el; n; n = n.offsetParent) { left += n.offsetLeft; top += n.offsetTop; }
      return { x: +left.toFixed(2), y: +top.toFixed(2), w: el.offsetWidth, h: el.offsetHeight };
    };
    const chipOf = (chip) => {
      const fitSpan = chip.querySelector("span[style*='zoom']");
      const rankEl = chip.querySelector("[data-tier-rank]");
      const valueEl = chip.querySelector("[data-tier-value]");
      return {
        rect: toLocal(chip.getBoundingClientRect()),
        layout: layout(chip),
        text: (chip.textContent || "").trim().replace(/\s+/g, " "),
        opacity: parseFloat(getComputedStyle(chip).opacity),
        transform: getComputedStyle(chip).transform,
        fitZoom: fitSpan ? parseFloat(getComputedStyle(fitSpan).zoom) || 1 : 1,
        rank: rankEl ? rankEl.textContent.trim() : null,
        value: valueEl ? valueEl.textContent.trim() : null,
      };
    };
    const tierEls = [...stack.querySelectorAll("[data-tier]")];
    const tierData = tierEls.map((tierEl) => {
      const band = tierEl.querySelector("[data-tier-band]");
      const labelEl = tierEl.querySelector("[data-tier-label]");
      const chips = [...tierEl.querySelectorAll("[data-tier-chip]")].map(chipOf);
      return {
        index: tierEl.getAttribute("data-tier"),
        rect: toLocal(tierEl.getBoundingClientRect()),
        layout: layout(tierEl),
        band: band
          ? { rect: toLocal(band.getBoundingClientRect()), layout: layout(band), opacity: parseFloat(getComputedStyle(band).opacity) }
          : null,
        label: labelEl
          ? {
              text: labelEl.textContent.trim(),
              rect: toLocal(labelEl.getBoundingClientRect()),
              fontSize: parseFloat(getComputedStyle(labelEl).fontSize),
            }
          : null,
        chips,
      };
    });
    return {
      mode: stack.getAttribute("data-tiers-mode"),
      empty: stack.hasAttribute("data-tiers-empty"),
      rect: toLocal(stack.getBoundingClientRect()),
      nodeCount: stack.querySelectorAll("*").length,
      tierCount: tierData.length,
      chipCount: tierData.reduce((s, t) => s + t.chips.length, 0),
      tiers: tierData,
    };
  })();

  // ── PL-2.1 BarChart geometry ────────────────────────────────────────────────
  // SVG viewBox primitive (like Divergence). Reports the svg rect + scaleX/scaleY + node count,
  // the baseline + tick line positions, and PER BAR a DUAL read: the transform-blind LAYOUT box
  // (the <rect>'s viewBox x/y/w/h attributes — the stable geometry, never a fn of t) AND the
  // PAINTED rect (getBoundingClientRect, transform-aware so the baseline-anchored grow is visible)
  // + the computed transform on the grow <g> (D2 reads style.transform). Plus value/category
  // labels (rect/text/eff-fontSize/opacity). Sampled across `t` by tools/qa-bars.mjs to assert
  // D1 (bar-within-plot), D2 (grow-from-baseline + settle), D3 (layout reserved), D4 (value-axis
  // correctness), D5 (label no-overlap/fit), D6 (caps).
  const bars = (() => {
    const svg = canvas.querySelector("[data-bar]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);

    const catEls = [...svg.querySelectorAll("[data-bar-cat]")].map((g) => {
      const rects = [...g.querySelectorAll("[data-bar-rect]")].map((rectEl) => {
        const growG = rectEl.closest("[data-bar-grow]");
        return {
          // transform-blind LAYOUT box: the rect's own viewBox attributes (stable, never a fn of t).
          layout: { x: +rectEl.getAttribute("x"), y: +rectEl.getAttribute("y"), w: +rectEl.getAttribute("width"), h: +rectEl.getAttribute("height") },
          // PAINTED rect (transform-aware — the grow scale is visible here), canvas-local CSS px.
          painted: localOf(rectEl),
          transform: growG ? getComputedStyle(growG).transform : "none",
          series: rectEl.getAttribute("data-bar-series"),
          seg: rectEl.getAttribute("data-bar-seg"),
        };
      });
      const vlabels = [...g.querySelectorAll("[data-bar-vlabel]")].map((tEl) => ({
        text: tEl.textContent,
        rect: localOf(tEl),
        fontSize: parseFloat(getComputedStyle(tEl).fontSize),
        opacity: parseFloat(getComputedStyle(tEl).opacity),
      }));
      const catLabelEl = g.querySelector("[data-bar-catlabel]");
      return {
        index: g.getAttribute("data-bar-cat"),
        rects,
        vlabels,
        catLabel: catLabelEl
          ? { text: catLabelEl.textContent, rect: localOf(catLabelEl), fontSize: parseFloat(getComputedStyle(catLabelEl).fontSize), opacity: parseFloat(getComputedStyle(catLabelEl).opacity) }
          : null,
      };
    });
    const baselineEl = svg.querySelector("[data-bar-baseline]");
    const ticks = [...svg.querySelectorAll("[data-bar-tick] line")].map(lineAttr);
    const legendChips = [...svg.querySelectorAll("[data-bar-legend] text")].map((tEl) => ({ text: tEl.textContent, rect: localOf(tEl) }));
    // PL-4.2 referenceLine — line attrs + viewBox-anchored attrs, computed stroke (the NEUTRAL-colour
    // check), the group's reveal opacity, and the optional right-anchored label (rect/text/opacity).
    const reflineEl = svg.querySelector("[data-bar-refline-line]");
    const reflineGroup = svg.querySelector("[data-bar-refline]");
    const reflineLabelEl = svg.querySelector("[data-bar-refline-label]");
    const referenceLine = reflineEl
      ? {
          ...lineAttr(reflineEl),
          painted: localOf(reflineEl),
          stroke: getComputedStyle(reflineEl).stroke,
          strokeWidth: parseFloat(getComputedStyle(reflineEl).strokeWidth),
          opacity: parseFloat(getComputedStyle(reflineGroup || reflineEl).opacity),
          label: reflineLabelEl
            ? { text: reflineLabelEl.textContent, rect: localOf(reflineLabelEl), opacity: parseFloat(getComputedStyle(reflineLabelEl).opacity) }
            : null,
        }
      : null;
    return {
      mode: svg.getAttribute("data-bar-mode"),
      orientation: svg.getAttribute("data-bar-orientation"),
      empty: svg.hasAttribute("data-bar-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      baseline: lineAttr(baselineEl),
      ticks,
      legendChips,
      referenceLine,
      barCount: catEls.reduce((s, c) => s + c.rects.length, 0),
      catCount: catEls.length,
      cats: catEls,
    };
  })();

  // ── PL-2.2 ScatterPlot geometry ─────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Divergence). Reports the svg rect + scaleX/scaleY + node
  // count, x/y tick + gridline attrs, quadrant divider line attrs + region-label rects/text, the
  // trend <path>/<line> endpoints + computed strokeDashoffset + reveal attr, and PER POINT a DUAL
  // read: the transform-blind LAYOUT center (the <circle>'s cx/cy attrs — the stable geometry,
  // never a fn of t) AND the PAINTED center (getBoundingClientRect center, transform-aware so the
  // pop is visible) + the computed transform on the dot <g> (D2 reads style.transform), plus the
  // point label rect/text/eff-fontSize/opacity. Sampled across `t` by tools/qa-scatter.mjs to assert
  // D1 (point-within-plot), D2 (pop+settle), D3 (layout reserved), D4 (axis correctness both dims),
  // D-trend (trend correctness + draw-on), D-quad (dividers + region labels), D5 (label no-overlap),
  // D6 (cap), D7 (mobile floors).
  //
  // §3 ruling 1 — overlapping dots must NOT trip the gating collisions/crampedPairs scan (a scatter
  // is a cloud; coincident points are honest). Those scans iterate `measured`, which is built from
  // `leaves` = TEXT leaves only (an element with a text child node). The dots are SVG <circle>/<g>
  // with NO text node, so they are NEVER in `measured` and CANNOT contribute a collision or
  // crampedPair — the scan already excludes them structurally, no [data-scatter-dot] filter needed.
  // Only the point/quad/axis LABELS (genuine text) are collision-gated, exactly as D5/D-quad intend.
  const scatter = (() => {
    const svg = canvas.querySelector("[data-scatter]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);

    const pointEls = [...svg.querySelectorAll("[data-scatter-point]")].map((g) => {
      const dotG = g.querySelector("[data-scatter-dot]");
      const circle = g.querySelector("circle");
      const cbc = circle ? circle.getBoundingClientRect() : null;
      const plabelEl = g.querySelector("[data-scatter-plabel]");
      return {
        index: g.getAttribute("data-scatter-point"),
        // transform-blind LAYOUT center: the circle's own cx/cy/r attributes (stable, never a fn of t).
        layout: circle ? { cx: +circle.getAttribute("cx"), cy: +circle.getAttribute("cy"), r: +circle.getAttribute("r") } : null,
        // PAINTED center (transform-aware — the pop scale is visible here), canvas-local CSS px.
        painted: cbc ? { cx: +(cbc.left + cbc.width / 2 - cb.left).toFixed(2), cy: +(cbc.top + cbc.height / 2 - cb.top).toFixed(2), rx: +(cbc.width / 2).toFixed(2) } : null,
        transform: dotG ? getComputedStyle(dotG).transform : "none",
        plabel: plabelEl
          ? { text: plabelEl.textContent, rect: localOf(plabelEl), fontSize: parseFloat(getComputedStyle(plabelEl).fontSize), opacity: parseFloat(getComputedStyle(plabelEl).opacity) }
          : null,
      };
    });

    const trendEl = svg.querySelector("[data-scatter-trend]");
    const trend = trendEl
      ? {
          ...lineAttr(trendEl),
          pathLength: trendEl.getAttribute("pathLength") != null ? +trendEl.getAttribute("pathLength") : null,
          dashoffset: parseFloat(getComputedStyle(trendEl).strokeDashoffset),
          reveal: trendEl.getAttribute("data-scatter-trend-reveal") != null ? +trendEl.getAttribute("data-scatter-trend-reveal") : null,
        }
      : null;

    const dividers = [...svg.querySelectorAll("[data-scatter-divider]")].map((el) => ({ axis: el.getAttribute("data-scatter-divider"), ...lineAttr(el) }));
    const quadLabels = [...svg.querySelectorAll("[data-scatter-quadlabel]")].map((el) => ({
      index: el.getAttribute("data-scatter-quadlabel"),
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));
    const xTicks = [...svg.querySelectorAll('[data-scatter-tick^="x"] line')].map(lineAttr);
    const yTicks = [...svg.querySelectorAll('[data-scatter-tick^="y"] line')].map(lineAttr);
    const axisTitles = [...svg.querySelectorAll("[data-scatter-axistitle]")].map((el) => ({
      axis: el.getAttribute("data-scatter-axistitle"),
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
    }));

    return {
      empty: svg.hasAttribute("data-scatter-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      // PL-0.8 — the RENDERED (row-aware) viewBox dims; qa-scatter recomputes the plot band from viewH.
      viewW: vb[2] || 1000,
      viewH: vb[3] || 640,
      nodeCount: svg.querySelectorAll("*").length,
      pointCount: pointEls.length,
      points: pointEls,
      trend,
      dividers,
      quadLabels,
      xTicks,
      yTicks,
      axisTitles,
    };
  })();

  // ── PL-2.3 Donut geometry ────────────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Scatter). Reports the svg rect + scaleX/scaleY + node
  // count, and PER ARC: the transform-blind angular geometry (start/sweep angle ATTRS + cx/cy/r —
  // the stable geometry, never a fn of t), the computed strokeDasharray/strokeDashoffset (the SWEEP
  // mechanism the C-SWEEP settle check reads — §3 ruling 2), and the PAINTED bbox (getBoundingClientRect,
  // canvas-local CSS px — for the C-FRAME ring-within-frame bound). Plus the outside name/value labels
  // (rect/text/eff-fontSize/opacity) and the center headline + caption. Sampled across `t` by
  // tools/qa-donut.mjs to assert C-ARC, C-SWEEP, C-FRAME, C-COUNT, C-LABEL, C-RESERVED, C-CENTER.
  //
  // NOTE: the arc <circle>s carry NO text node, so (like scatter dots) they are never in `measured`
  // and cannot trip the gating collisions scan — only the genuine text labels are collision-gated.
  const donut = (() => {
    const svg = canvas.querySelector("[data-donut]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 640 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 640);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());

    const segEls = [...svg.querySelectorAll("[data-donut-seg]")].map((c) => {
      const cs = getComputedStyle(c);
      // strokeDasharray reports "Apx, Bpx" in CSS px (viewBox px × scale). Parse the first stop (drawn).
      const da = (cs.strokeDasharray || "").split(/[, ]+/).map((s) => parseFloat(s)).filter((n) => Number.isFinite(n));
      return {
        index: c.getAttribute("data-donut-seg"),
        startAngleDeg: +c.getAttribute("data-donut-startangle"),
        sweepAngleDeg: +c.getAttribute("data-donut-sweepangle"),
        // transform-blind LAYOUT geometry: the circle's own attrs (stable, never a fn of t).
        layout: { cx: +c.getAttribute("cx"), cy: +c.getAttribute("cy"), r: +c.getAttribute("r") },
        // The sweep mechanism (CSS px). drawn = first dash stop; dashoffset (NaN/0 once omitted).
        dashDrawn: da.length ? +da[0].toFixed(2) : 0,
        dashGap: da.length > 1 ? +da[1].toFixed(2) : 0,
        dashoffset: parseFloat(cs.strokeDashoffset), // NaN/none → the omit-at-settle case
        dashoffsetRaw: cs.strokeDashoffset,
        strokeWidth: parseFloat(cs.strokeWidth),
        // PL-4.2 emphasis (OPACITY-ONLY focus): the arc's paint opacity — 1 for a focused/normal wedge,
        // DIM_OPACITY for a de-emphasized one. Static across t (paint, not the dash-driven sweep).
        opacity: parseFloat(cs.opacity),
        // transform is the SVG rotate ATTR (static); the CSS `transform` must stay "none" (no CSS tx).
        cssTransform: cs.transform,
        painted: localOf(c),
      };
    });

    const labelOf = (el) => (el ? { text: el.textContent, rect: localOf(el), fontSize: parseFloat(getComputedStyle(el).fontSize), opacity: (() => { let o = 1; for (let n = el; n && n !== canvas; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || "1"); return +o.toFixed(3); })() } : null);
    const names = [...svg.querySelectorAll("[data-donut-name]")].map(labelOf);
    const values = [...svg.querySelectorAll("[data-donut-value]")].map(labelOf);
    const centerEl = svg.querySelector("[data-donut-center]");
    const centerCapEl = svg.querySelector("[data-donut-center-cap]");

    return {
      empty: svg.hasAttribute("data-donut-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      segCount: segEls.length,
      segments: segEls,
      names,
      values,
      center: centerEl
        ? { text: (centerEl.textContent || "").trim(), rect: localOf(centerEl), fontSize: (() => { const span = centerEl.querySelector("span[style*='zoom']"); return span ? parseFloat(getComputedStyle(span).fontSize) * (parseFloat(getComputedStyle(span).zoom) || 1) : 0; })() }
        : null,
      centerCap: centerCapEl ? { text: centerCapEl.textContent, rect: localOf(centerCapEl), fontSize: parseFloat(getComputedStyle(centerCapEl).fontSize) } : null,
    };
  })();

  // ── PL-2.4 AreaChart geometry ────────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Scatter/Donut). Reports the svg rect + scaleX/scaleY + node
  // count, the baseline + tick line positions + x-labels, and PER SERIES a DUAL read: the
  // transform-blind FINAL path geometry (the fill <path d=…> attr string + the top-edge stroke <path>
  // d + width — the stable geometry, BYTE-IDENTICAL across every t, never a fn of t) AND the PAINTED
  // bbox (getBoundingClientRect, clip-aware so the left→right wipe is visible). The §3-ruling-3
  // reveal mechanism is the SINGLE clip-rect WIDTH (data-area-clip / data-area-clip-w) — the only
  // t-driven geometry — exposed here so the gate asserts clipWidth == areaEdge(t)·xSpan. Plus the
  // per-series end labels + x-axis labels (rect/text/eff-fontSize/opacity). Sampled across `t` by
  // tools/qa-area.mjs to assert C-within-plot, C-fill-rise, C-value-axis, C-layout-reserved, C-labels,
  // C-caps, C-mobile.
  //
  // NOTE: the fill/stroke <path>s carry NO text node, so (like scatter dots / donut arcs) they are
  // never in `measured` and cannot trip the gating collisions scan — only the genuine text labels are.
  const area = (() => {
    const svg = canvas.querySelector("[data-area]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);

    const seriesEls = [...svg.querySelectorAll("[data-area-series]")].map((g) => {
      const fillEl = g.querySelector("[data-area-path]");
      const edgeEl = g.querySelector("[data-area-edge]");
      const es = edgeEl ? getComputedStyle(edgeEl) : null;
      return {
        index: g.getAttribute("data-area-series"),
        accent: g.getAttribute("data-area-accent"),
        // transform-blind FINAL geometry: the path `d` attribute strings (stable, never a fn of t).
        fillD: fillEl ? fillEl.getAttribute("d") : null,
        edgeD: edgeEl ? edgeEl.getAttribute("d") : null,
        strokeW: es ? parseFloat(es.strokeWidth) : 0,
        // PAINTED bbox (clip-aware — the left→right wipe is visible here), canvas-local CSS px.
        paintedFill: fillEl ? localOf(fillEl) : null,
        paintedEdge: edgeEl ? localOf(edgeEl) : null,
        // The CSS transform on the fill/edge paths MUST stay "none" (§3 ruling 3 — no CSS transform).
        fillTransform: fillEl ? getComputedStyle(fillEl).transform : "none",
        edgeTransform: es ? es.transform : "none",
      };
    });

    // The single reveal clip-rect (§3 ruling 3) — the ONLY t-driven geometry. Its WIDTH attribute
    // (and the data-area-clip-w mirror) tracks areaEdge(t)·xSpan.
    const clipEl = svg.querySelector("[data-area-clip]");
    const clip = clipEl
      ? {
          x: +clipEl.getAttribute("x"),
          y: +clipEl.getAttribute("y"),
          width: +clipEl.getAttribute("width"),
          height: +clipEl.getAttribute("height"),
          widthAttr: clipEl.getAttribute("data-area-clip-w") != null ? +clipEl.getAttribute("data-area-clip-w") : null,
        }
      : null;

    const baselineEl = svg.querySelector("[data-area-baseline]");
    const ticks = [...svg.querySelectorAll("[data-area-tick] line")].map(lineAttr);
    const xLabels = [...svg.querySelectorAll("[data-area-xlabel]")].map((tEl) => ({
      text: tEl.textContent,
      rect: localOf(tEl),
      fontSize: parseFloat(getComputedStyle(tEl).fontSize),
      opacity: parseFloat(getComputedStyle(tEl).opacity),
    }));
    const endLabels = [...svg.querySelectorAll("[data-area-endlabel]")].map((tEl) => ({
      text: tEl.textContent,
      rect: localOf(tEl),
      fontSize: parseFloat(getComputedStyle(tEl).fontSize),
      opacity: parseFloat(getComputedStyle(tEl).opacity),
    }));
    const legendChips = [...svg.querySelectorAll("[data-area-legend] text")].map((tEl) => ({ text: tEl.textContent, rect: localOf(tEl) }));
    // PL-4.2 annotations — per callout: the group opacity (the fade-after-edge reveal), the label
    // rect/text/font, and the NEUTRAL leader's computed stroke + width (the neutral-connector check).
    const annotations = [...svg.querySelectorAll("[data-area-annotation]")].map((g) => {
      const lbl = g.querySelector("[data-area-annlabel]");
      const leader = g.querySelector("[data-area-annleader]");
      const op = parseFloat(getComputedStyle(g).opacity);
      return {
        index: g.getAttribute("data-area-annotation"),
        opacity: op,
        shown: op > 0.5,
        labelRect: lbl ? localOf(lbl) : null,
        text: lbl ? lbl.textContent : null,
        fontSize: lbl ? parseFloat(getComputedStyle(lbl).fontSize) : 0,
        leaderStroke: leader ? getComputedStyle(leader).stroke : null,
        leaderWidth: leader ? parseFloat(getComputedStyle(leader).strokeWidth) : 0,
      };
    });

    return {
      mode: svg.getAttribute("data-area-mode"),
      empty: svg.hasAttribute("data-area-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      viewH: vb[3] || 640, // PL-0.8 row-aware viewBox height — qa-area plans with the RENDERED value
      nodeCount: svg.querySelectorAll("*").length,
      seriesCount: seriesEls.length,
      series: seriesEls,
      clip,
      baseline: lineAttr(baselineEl),
      ticks,
      xLabels,
      endLabels,
      legendChips,
      annotations,
    };
  })();

  // ── PL-2.6 Histogram geometry ─────────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Scatter/Area). Reports the svg rect + scaleX/scaleY + node
  // count, the baseline + count-tick + numeric x-edge-tick line attrs + labels, and PER BIN a DUAL
  // read: the transform-blind LAYOUT box (the <rect>'s viewBox x/y/w/h attrs — the stable geometry,
  // never a fn of t) AND the PAINTED rect (getBoundingClientRect, transform-aware so the baseline-
  // anchored grow is visible) + the computed style.transform on the bin grow <g> (D2 reads it).
  // Plus per-bin count labels (rect/text/eff-fontSize/opacity); markers (line attrs + strokeDashoffset/
  // pathLength + a data-histogram-marker-reveal mirror + the label rect/text/opacity); the x/y axis
  // titles. nodeCount/binCount detect mount/unmount.
  //
  // NOTE: the bin <rect>s / marker <line>s carry NO text node, so (like scatter dots / area paths)
  // they are never in `measured` and cannot trip the gating collisions scan — only the genuine text
  // labels (bin counts, x-ticks, marker labels, titles) are collision-gated, exactly as D-label intends.
  const histogram = (() => {
    const svg = canvas.querySelector("[data-histogram]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);

    const binEls = [...svg.querySelectorAll("[data-histogram-bin]")].map((g) => {
      const rectEl = g.querySelector("[data-histogram-rect]");
      const growG = rectEl ? rectEl.closest("[data-histogram-grow]") : g.querySelector("[data-histogram-grow]");
      const labelEl = g.querySelector("[data-histogram-binlabel]");
      return {
        index: g.getAttribute("data-histogram-bin"),
        // transform-blind LAYOUT box: the rect's own viewBox attributes (stable, never a fn of t).
        // A zero-count bin paints no <rect> → layout null (height 0 by design).
        layout: rectEl ? { x: +rectEl.getAttribute("x"), y: +rectEl.getAttribute("y"), w: +rectEl.getAttribute("width"), h: +rectEl.getAttribute("height") } : null,
        // PAINTED rect (transform-aware — the grow scale is visible here), canvas-local CSS px.
        painted: rectEl ? localOf(rectEl) : null,
        transform: growG ? getComputedStyle(growG).transform : "none",
        binlabel: labelEl
          ? { text: labelEl.textContent, rect: localOf(labelEl), fontSize: parseFloat(getComputedStyle(labelEl).fontSize), opacity: parseFloat(getComputedStyle(labelEl).opacity) }
          : null,
      };
    });

    const markers = [...svg.querySelectorAll("[data-histogram-marker]")].map((g) => {
      const lineEl = g.querySelector("[data-histogram-marker-line]");
      const labelEl = g.querySelector("[data-histogram-marker-label]");
      const ls = lineEl ? getComputedStyle(lineEl) : null;
      return {
        index: g.getAttribute("data-histogram-marker"),
        kind: g.getAttribute("data-histogram-marker-kind"),
        ...lineAttr(lineEl),
        pathLength: lineEl && lineEl.getAttribute("pathLength") != null ? +lineEl.getAttribute("pathLength") : null,
        dashoffset: ls ? parseFloat(ls.strokeDashoffset) : null,
        reveal: lineEl && lineEl.getAttribute("data-histogram-marker-reveal") != null ? +lineEl.getAttribute("data-histogram-marker-reveal") : null,
        label: labelEl
          ? { text: labelEl.textContent, rect: localOf(labelEl), fontSize: parseFloat(getComputedStyle(labelEl).fontSize), opacity: parseFloat(getComputedStyle(labelEl).opacity) }
          : null,
      };
    });

    const baselineEl = svg.querySelector("[data-histogram-baseline]");
    const yTicks = [...svg.querySelectorAll("[data-histogram-ytick] line")].map(lineAttr);
    const xTickLabels = [...svg.querySelectorAll("[data-histogram-xticklabel]")].map((tEl) => ({
      index: tEl.getAttribute("data-histogram-xticklabel"),
      text: tEl.textContent,
      rect: localOf(tEl),
      fontSize: parseFloat(getComputedStyle(tEl).fontSize),
      opacity: parseFloat(getComputedStyle(tEl).opacity),
    }));
    const axisTitles = [...svg.querySelectorAll("[data-histogram-axistitle]")].map((el) => ({
      axis: el.getAttribute("data-histogram-axistitle"),
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
    }));

    return {
      empty: svg.hasAttribute("data-histogram-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      viewH: vb[3] || 640, // PL-0.8 row-aware viewBox height — qa-histogram plans with the RENDERED value
      nodeCount: svg.querySelectorAll("*").length,
      binCount: binEls.length,
      bins: binEls,
      markers,
      baseline: lineAttr(baselineEl),
      yTicks,
      xTickLabels,
      axisTitles,
    };
  })();

  // ── PL-2.7 LineChart geometry ──────────────────────────────────────────────────
  // SVG viewBox primitive (the project's ORIGINAL line chart, retrofitted). Reports the svg rect +
  // scaleX/scaleY + node count, the y-tick gridlines, the x-labels, and PER SERIES a DUAL read: the
  // transform-blind FINAL geometry (the trace <path d> + the area-fill <path d> — the stable geometry,
  // BYTE-IDENTICAL across every t, never a fn of t) AND the draw-on (pathLength + computed
  // strokeDashoffset). The §3-ruling-4 default-path discipline: the line path carries NO CSS transform
  // (the draw-on is strokeDashoffset). Plus the area-fill clip-rect WIDTH (the area-variant left→right
  // wipe), the vertex markers (cx/cy attrs + computed transform — the pop), the end-dots + end-labels,
  // and the annotation leaders/labels (rect/text/opacity). Sampled across `t` by tools/qa-line.mjs.
  //
  // NOTE: the trace / fill <path>s + marker <circle>s carry NO text node, so (like scatter dots / area
  // paths) they are never in `measured` and cannot trip the gating collisions scan — only the genuine
  // text labels (ticks, x-labels, end-labels, annotation labels) are collision-gated.
  const line = (() => {
    const svg = canvas.querySelector("[data-line]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 920 390").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 920);
    const scaleY = sr.height / (vb[3] || 390);
    const localOf = (el) => toLocal(el.getBoundingClientRect());

    const seriesEls = [...svg.querySelectorAll("[data-line-series]")].map((g) => {
      const lineEl = g.querySelector("[data-line-path]");
      const fillEl = g.querySelector("[data-line-fill]");
      const ls = lineEl ? getComputedStyle(lineEl) : null;
      const endDotEl = g.querySelector("[data-line-enddot]");
      const markers = [...g.querySelectorAll("[data-line-marker]")].map((m) => {
        const cbm = m.getBoundingClientRect();
        return {
          // transform-blind LAYOUT center: the circle's own cx/cy attrs (stable, never a fn of t).
          cx: +m.getAttribute("cx"),
          cy: +m.getAttribute("cy"),
          r: +m.getAttribute("r"),
          // PAINTED center (transform-aware — the pop scale is visible here).
          painted: { cx: +(cbm.left + cbm.width / 2 - cb.left).toFixed(2), cy: +(cbm.top + cbm.height / 2 - cb.top).toFixed(2) },
          transform: getComputedStyle(m).transform,
        };
      });
      return {
        index: g.getAttribute("data-line-series"),
        // transform-blind FINAL geometry: the path `d` attribute strings (stable, never a fn of t).
        lineD: lineEl ? lineEl.getAttribute("d") : null,
        fillD: fillEl ? fillEl.getAttribute("d") : null,
        strokeW: ls ? parseFloat(ls.strokeWidth) : 0,
        pathLength: lineEl && lineEl.getAttribute("pathLength") != null ? +lineEl.getAttribute("pathLength") : null,
        dashoffset: ls ? parseFloat(ls.strokeDashoffset) : null,
        // The CSS transform on the trace MUST stay "none" (§3 ruling 4 — draw-on is dashoffset).
        lineTransform: ls ? ls.transform : "none",
        fillTransform: fillEl ? getComputedStyle(fillEl).transform : "none",
        endDot: endDotEl ? { cx: +endDotEl.getAttribute("cx"), cy: +endDotEl.getAttribute("cy"), r: +endDotEl.getAttribute("r"), opacity: parseFloat(getComputedStyle(endDotEl).opacity) } : null,
        markers,
      };
    });

    const clipEl = svg.querySelector("[data-line-clip]");
    const clip = clipEl
      ? { x: +clipEl.getAttribute("x"), y: +clipEl.getAttribute("y"), width: +clipEl.getAttribute("width"), height: +clipEl.getAttribute("height"), widthAttr: clipEl.getAttribute("data-line-clip-w") != null ? +clipEl.getAttribute("data-line-clip-w") : null }
      : null;

    const xLabels = [...svg.querySelectorAll("text")]
      .filter((t) => t.getAttribute("text-anchor") === "middle" && !t.closest("[data-line-annotation]"))
      .map((tEl) => ({ text: tEl.textContent, rect: localOf(tEl), fontSize: parseFloat(getComputedStyle(tEl).fontSize), opacity: parseFloat(getComputedStyle(tEl).opacity) }));
    const endLabels = [...svg.querySelectorAll("[data-line-endlabel]")].map((tEl) => ({
      text: tEl.textContent,
      rect: localOf(tEl),
      fontSize: parseFloat(getComputedStyle(tEl).fontSize),
      opacity: parseFloat(getComputedStyle(tEl).opacity),
    }));
    const annotations = [...svg.querySelectorAll("[data-line-annotation]")].map((g) => {
      const lbl = g.querySelector("[data-line-annlabel]");
      const op = parseFloat(getComputedStyle(g).opacity);
      return {
        index: g.getAttribute("data-line-annotation"),
        opacity: op,
        shown: op > 0.5,
        labelRect: lbl ? localOf(lbl) : null,
        text: lbl ? lbl.textContent : null,
        fontSize: lbl ? parseFloat(getComputedStyle(lbl).fontSize) : 0,
      };
    });

    return {
      variant: svg.getAttribute("data-line-variant"),
      empty: svg.hasAttribute("data-line-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      seriesCount: seriesEls.length,
      series: seriesEls,
      clip,
      xLabels,
      endLabels,
      annotations,
    };
  })();

  // ── PL-3.3 Funnel geometry ─────────────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Area). Reports the svg rect + scaleX/scaleY + node count,
  // and PER BAND a transform-blind LAYOUT box (the <rect>'s viewBox x/y/w/h ATTRS — the stable
  // geometry, never a fn of t; the reveal is a clip whose height grows, so the rect attrs stay
  // fixed) + the PAINTED rect (getBoundingClientRect, clip-aware so the top→down wipe is visible) +
  // the data-funnel-band-w (the planned painted width, for the monotonic-painted-width check) +
  // the monotonic-clamp flag. Plus per-band stage/value labels (rect/text/eff-fontSize/opacity),
  // the taper-wall polygons (point attrs + opacity), and the drop-off labels (rect/text/opacity).
  // Sampled across `t` by tools/qa-funnel.mjs to assert C9 (geometry static), C10 (band-within-
  // frame, NEW), C11 (no-label-overlap, NEW), C6 (monotonic-painted-width, NEW), drop-off-pct
  // (NEW), and C12 (settle / clip omitted).
  //
  // NOTE: the band <rect>s / wall <polygon>s carry NO text node, so (like scatter dots / area paths)
  // they are never in `measured` and cannot trip the gating collisions scan — only the genuine text
  // labels (stage labels, value labels, drop-off %) are collision-gated, exactly as C11 intends.
  const funnel = (() => {
    const svg = canvas.querySelector("[data-funnel]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());

    const bandEls = [...svg.querySelectorAll("[data-funnel-band]")].map((g) => {
      const rectEl = g.querySelector("[data-funnel-rect]");
      const labelEl = g.querySelector("[data-funnel-label]");
      const valueEl = g.querySelector("[data-funnel-value]");
      const cs = rectEl ? getComputedStyle(rectEl) : null;
      return {
        index: g.getAttribute("data-funnel-band"),
        // The planned painted width (the monotonic-painted-width source of truth, never a fn of t).
        plannedW: g.getAttribute("data-funnel-band-w") != null ? +g.getAttribute("data-funnel-band-w") : null,
        monotonicClamp: g.getAttribute("data-funnel-clamp") === "1",
        // transform-blind LAYOUT box: the rect's own viewBox attributes (stable, never a fn of t).
        layout: rectEl ? { x: +rectEl.getAttribute("x"), y: +rectEl.getAttribute("y"), w: +rectEl.getAttribute("width"), h: +rectEl.getAttribute("height") } : null,
        // PAINTED rect (clip-aware — the top→down wipe is visible here), canvas-local CSS px.
        painted: rectEl ? localOf(rectEl) : null,
        radius: cs ? parseFloat(cs.rx) || 0 : 0,
        // The reveal mechanism is a clipPath — once settled the clip is OMITTED (clipPath:"none").
        clip: cs ? cs.clipPath : "none",
        rectStroke: cs ? parseFloat(cs.strokeWidth) || 0 : 0,
        label: labelEl
          ? { text: labelEl.textContent, rect: localOf(labelEl), fontSize: parseFloat(getComputedStyle(labelEl).fontSize), opacity: parseFloat(getComputedStyle(labelEl).opacity) }
          : null,
        value: valueEl
          ? { text: valueEl.textContent, rect: localOf(valueEl), fontSize: parseFloat(getComputedStyle(valueEl).fontSize), opacity: parseFloat(getComputedStyle(valueEl).opacity) }
          : null,
      };
    });

    const walls = [...svg.querySelectorAll("[data-funnel-wall]")].map((w) => {
      const pts = (w.getAttribute("points") || "")
        .trim()
        .split(/\s+/)
        .map((p) => p.split(",").map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
      return { points: pts, opacity: parseFloat(getComputedStyle(w).opacity) };
    });

    const drops = [...svg.querySelectorAll("[data-funnel-drop]")].map((d) => ({
      text: d.textContent,
      rect: localOf(d),
      fontSize: parseFloat(getComputedStyle(d).fontSize),
      opacity: parseFloat(getComputedStyle(d).opacity),
    }));

    return {
      mode: svg.getAttribute("data-funnel-mode"),
      empty: svg.hasAttribute("data-funnel-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      viewW: vb[2] || 1000,
      viewH: vb[3] || 640,
      nodeCount: svg.querySelectorAll("*").length,
      bandCount: bandEls.length,
      bands: bandEls,
      walls,
      drops,
    };
  })();

  // ── PL-2.5 Candlestick geometry ──────────────────────────────────────────────
  // SVG viewBox primitive (like BarChart/Scatter). Reports the svg rect + scaleX/scaleY + the
  // RENDERED (row-aware, PL-0.8) viewBox dims (qa-candlestick recomputes the plot band from viewH) +
  // node count, the price-axis tick line positions, and PER CANDLE a DUAL read: the transform-blind
  // LAYOUT box (the body <rect> / wick <line> ATTRS — the stable geometry, never a fn of t) AND the
  // PAINTED box (getBoundingClientRect, transform-aware so the body grow + wick draw are visible) +
  // the computed transform on the grow <g> + the body fill (up/down color) + the wick's computed
  // strokeDashoffset, plus the per-candle direction. Plus the time-slot labels (rect/text/eff-
  // fontSize/opacity). Sampled across `t` by tools/qa-candlestick.mjs to assert D1 (candle-within-
  // plot), D2 (body-spans-open-close), D3 (wick-spans-high-low), D4 (up-down-color), D5 (non-0-
  // anchored axis), D6 (doji floor), D7 (grow/draw + settle), D8 (layout reserved), D9 (caps),
  // D10 (time-label no-overlap), D11 (mobile floors incl. the painted-body-width@390 floor).
  //
  // NOTE: the body <rect>s / wick <line>s carry NO text node, so (like scatter dots / area paths)
  // they are never in `measured` and cannot trip the gating collisions scan — only the genuine text
  // labels (price ticks, time labels) are collision-gated, exactly as D10/D11 intend.
  const candles = (() => {
    const svg = canvas.querySelector("[data-candle]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);
    const rectAttr = (el) => (el ? { x: +el.getAttribute("x"), y: +el.getAttribute("y"), w: +el.getAttribute("width"), h: +el.getAttribute("height") } : null);

    const candleEls = [...svg.querySelectorAll("[data-candle-g]")].map((g) => {
      const growG = g.querySelector("[data-candle-grow]");
      const bodyEl = g.querySelector("[data-candle-body]");
      const wickEl = g.querySelector("[data-candle-wick], [data-candle-hl]");
      const openTick = g.querySelector("[data-candle-open-tick]");
      const closeTick = g.querySelector("[data-candle-close-tick]");
      const glyph = bodyEl || wickEl; // candles: the body rect; ohlc: the high–low line
      const cs = wickEl ? getComputedStyle(wickEl) : null;
      return {
        index: g.getAttribute("data-candle-g"),
        dir: g.getAttribute("data-candle-dir"),
        // transform-blind LAYOUT box of the body (candles) — the <rect>'s own viewBox attrs (stable).
        layout: bodyEl ? rectAttr(bodyEl) : null,
        // PAINTED body box (transform-aware — the grow is visible here), canvas-local CSS px.
        painted: bodyEl ? localOf(bodyEl) : null,
        // ohlc glyph painted box (the high–low line + ticks) for the ohlc-mode checks.
        glyphPainted: glyph ? localOf(glyph) : null,
        transform: growG ? getComputedStyle(growG).transform : "none",
        // candles: the body <rect> carries the color as `fill`; ohlc: the glyph is a <line> coloured
        // via `stroke` (its `fill` defaults to black). Read the right channel per mode so D4 compares
        // the actual painted colour.
        fill: bodyEl ? getComputedStyle(bodyEl).fill : glyph ? getComputedStyle(glyph).stroke : null,
        doji: bodyEl ? bodyEl.getAttribute("data-candle-doji") === "1" : false,
        // the wick's transform-blind layout (line attrs) + computed draw-on dashoffset.
        wick: wickEl ? { ...lineAttr(wickEl), dashoffset: cs ? parseFloat(cs.strokeDashoffset) : null, reveal: wickEl.getAttribute("data-candle-wick-reveal") != null ? +wickEl.getAttribute("data-candle-wick-reveal") : null } : null,
        openTick: openTick ? { ...lineAttr(openTick), painted: localOf(openTick) } : null,
        closeTick: closeTick ? { ...lineAttr(closeTick), painted: localOf(closeTick) } : null,
      };
    });
    const ticks = [...svg.querySelectorAll("[data-candle-tick] line")].map(lineAttr);
    // PL-2.5 Fix 3 — the price-axis tick LABEL boxes (value+unit), right-anchored in the left gutter.
    // Reported so the gate can prove each label's painted box stays inside the gutter (no left-clip,
    // no left-safe-margin breach) — the check that was absent and let the linspace decimals overflow.
    const ptlabels = [...svg.querySelectorAll("[data-candle-tick] text")].map((el) => ({
      text: el.textContent,
      rect: toLocal(el.getBoundingClientRect()),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));
    const tlabels = [...svg.querySelectorAll("[data-candle-tlabel]")].map((el) => ({
      index: el.getAttribute("data-candle-tlabel"),
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));

    return {
      mode: svg.getAttribute("data-candle-mode"),
      empty: svg.hasAttribute("data-candle-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      // PL-0.8 — the RENDERED (row-aware) viewBox dims; qa-candlestick recomputes the plot band from viewH.
      viewW: vb[2] || 1000,
      viewH: vb[3] || 640,
      nodeCount: svg.querySelectorAll("*").length,
      candleCount: candleEls.length,
      candles: candleEls,
      ticks,
      ptlabels,
      tlabels,
    };
  })();

  // ── PL-3.5 Distribution geometry ─────────────────────────────────────────────
  // SVG viewBox primitive (like Candlestick/Scatter). Reports the svg rect + scaleX/scaleY + the
  // RENDERED (row-aware, PL-0.8) viewBox dims (qa-distribution recomputes the row band from viewH) +
  // node count, the value-axis tick line positions, and PER GROUP a DUAL read: the transform-blind
  // LAYOUT box (the IQR box <rect> ATTRS — the stable geometry, never a fn of t) AND the PAINTED box
  // (getBoundingClientRect, transform-aware so the box-grow + whisker-draw are visible) + the computed
  // transform on the grow <g> + the box fill (group accent) + the whisker's computed strokeDashoffset/
  // line attrs + the outlier dot centers/radii + the median/mean line/diamond positions, plus the
  // per-group tinyN flag. Plus the group-row labels + the median value labels (rect/text/eff-fontSize/
  // opacity). Sampled across `t` by tools/qa-distribution.mjs to assert D1 (group-within-plot), D2
  // (box-spans-q1-q3), D3 (whisker-spans-range), D4 (median-within-box + thicker stroke), D5 (non-0-
  // anchored axis), D6 (zero-IQR floor), D7 (grow/draw + settle), D8 (layout reserved), D9 (caps),
  // D10 (row-label no-overlap), D-out (outlier-within-domain), D-mean (mean-marker), D11 (mobile floors
  // incl. the painted-outlier-dot-diameter@390 floor reading the rendered viewH).
  //
  // NOTE: the box <rect>s / whisker <line>s / outlier <circle>s carry NO text node, so (like scatter
  // dots / candle bodies) they are never in `measured` and cannot trip the gating collisions scan —
  // only the genuine text labels (value ticks, row labels, median value labels) are collision-gated,
  // exactly as D10/D11 intend (a 6px zero-IQR block or a 9px outlier dot never trips the text-floor scan).
  const distribution = (() => {
    const svg = canvas.querySelector("[data-dist]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const lineAttr = (el) => (el ? { x1: +el.getAttribute("x1"), y1: +el.getAttribute("y1"), x2: +el.getAttribute("x2"), y2: +el.getAttribute("y2") } : null);
    const rectAttr = (el) => (el ? { x: +el.getAttribute("x"), y: +el.getAttribute("y"), w: +el.getAttribute("width"), h: +el.getAttribute("height") } : null);
    const circleCenter = (el) => {
      if (!el) return null;
      const cbc = el.getBoundingClientRect();
      return { cx: +(cbc.left + cbc.width / 2 - cb.left).toFixed(2), cy: +(cbc.top + cbc.height / 2 - cb.top).toFixed(2), rx: +(cbc.width / 2).toFixed(2), r: +el.getAttribute("r") };
    };

    const groupEls = [...svg.querySelectorAll("[data-dist-g]")].map((g) => {
      const growG = g.querySelector("[data-dist-grow]");
      const boxEl = g.querySelector("[data-dist-box]");
      const whiskEl = g.querySelector("[data-dist-whisker]");
      const medEl = g.querySelector("[data-dist-median]");
      const meanEl = g.querySelector("[data-dist-mean]");
      const cs = whiskEl ? getComputedStyle(whiskEl) : null;
      const outlierEls = [...g.querySelectorAll("[data-dist-outlier]")].map(circleCenter);
      const mlabelEl = g.querySelector("[data-dist-mlabel]");
      // median position — the median <line>'s x (transform-blind) + painted center.
      let medPos = null;
      if (medEl) {
        const mb = medEl.getBoundingClientRect();
        medPos = { x: +medEl.getAttribute("x1"), strokeW: parseFloat(getComputedStyle(medEl).strokeWidth), paintedCx: +(mb.left + mb.width / 2 - cb.left).toFixed(2) };
      }
      let meanPos = null;
      if (meanEl) {
        const mb = meanEl.getBoundingClientRect();
        meanPos = { paintedCx: +(mb.left + mb.width / 2 - cb.left).toFixed(2), painted: localOf(meanEl) };
      }
      return {
        index: g.getAttribute("data-dist-g"),
        accent: g.getAttribute("data-dist-accent"),
        tinyN: g.getAttribute("data-dist-tinyn") === "1",
        // transform-blind LAYOUT box of the IQR box (the <rect>'s own viewBox attrs — stable).
        layout: boxEl ? rectAttr(boxEl) : null,
        // PAINTED box (transform-aware — the grow is visible here), canvas-local CSS px.
        painted: boxEl ? localOf(boxEl) : null,
        transform: growG ? getComputedStyle(growG).transform : "none",
        // the box <rect> carries the color as `fill` (stroke is the same accent).
        fill: boxEl ? getComputedStyle(boxEl).fill : null,
        ziqr: boxEl ? boxEl.getAttribute("data-dist-ziqr") === "1" : false,
        // the whisker's transform-blind layout (line attrs) + computed draw-on dashoffset.
        whisker: whiskEl ? { ...lineAttr(whiskEl), dashoffset: cs ? parseFloat(cs.strokeDashoffset) : null, strokeW: cs ? parseFloat(cs.strokeWidth) : null, reveal: whiskEl.getAttribute("data-dist-whisker-reveal") != null ? +whiskEl.getAttribute("data-dist-whisker-reveal") : null } : null,
        median: medPos,
        mean: meanPos,
        outliers: outlierEls,
        mlabel: mlabelEl ? { text: mlabelEl.textContent, rect: localOf(mlabelEl), fontSize: parseFloat(getComputedStyle(mlabelEl).fontSize), opacity: parseFloat(getComputedStyle(mlabelEl).opacity) } : null,
      };
    });

    const ticks = [...svg.querySelectorAll("[data-dist-tick] line")].map(lineAttr);
    const vtlabels = [...svg.querySelectorAll("[data-dist-tick] text")].map((el) => ({
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));
    const rlabels = [...svg.querySelectorAll("[data-dist-rlabel]")].map((el) => ({
      index: el.getAttribute("data-dist-rlabel"),
      text: el.textContent,
      rect: localOf(el),
      fontSize: parseFloat(getComputedStyle(el).fontSize),
      opacity: parseFloat(getComputedStyle(el).opacity),
    }));

    return {
      mode: svg.getAttribute("data-dist-mode"),
      empty: svg.hasAttribute("data-dist-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      // PL-0.8 — the RENDERED (row-aware) viewBox dims; qa-distribution recomputes the row band from viewH.
      viewW: vb[2] || 1000,
      viewH: vb[3] || 640,
      nodeCount: svg.querySelectorAll("*").length,
      groupCount: groupEls.length,
      groups: groupEls,
      ticks,
      vtlabels,
      rlabels,
    };
  })();

  // ── PL-3.4 Taxonomy geometry ─────────────────────────────────────────────────
  // SVG viewBox primitive (like Distribution/Scatter). Reports the svg rect + scaleX/scaleY + the
  // RENDERED (row-aware, PL-0.8) viewBox dims (qa-taxonomy recomputes the ranks from viewH) + node
  // count, and PER NODE a DUAL read: the transform-blind LAYOUT box (the chip <rect> ATTRS, or the hub
  // <circle> cx/cy/r — the stable geometry, never a fn of t) AND the PAINTED box (getBoundingClientRect,
  // transform-aware so the node pop is visible) + the computed transform on the node <g> + rank +
  // category index + chip fill (accent), plus the IN-CHIP label rect/text/eff-fontSize/opacity and the
  // optional leaf value chip. PER LINK: the path endpoints (parsed from `d`) + computed strokeDashoffset
  // + the parent/child node indices + the draw-on reveal mirror + mode. Sampled across `t` by
  // tools/qa-taxonomy.mjs to assert D1 (tree-within-frame), D2 (node-layout from tree), D3 (no-node-
  // overlap), D4 (child-within-parent-band), D5 (parent-child-link-connects), D6 (depth/breadth caps),
  // D7 (dynamic leaf-pitch + the §3 SHORT-ROW vertical checks), D8 (draw/pop + settle), D9 (layout
  // reserved), D10 (label no-overlap & fit), D11 (mobile floors incl. the painted-link-stroke@390).
  //
  // NOTE: the chip <rect>s / link <path>s carry NO text node, so (like scatter dots / candle bodies)
  // they are never in `measured` and cannot trip the gating collisions scan — only the genuine in-chip
  // labels (cat/leaf/root text) + value chips are collision-gated, exactly as D10/D11 intend.
  const taxonomy = (() => {
    const svg = canvas.querySelector("[data-tax]");
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 640").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 640);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const rectAttr = (el) => (el ? { x: +el.getAttribute("x"), y: +el.getAttribute("y"), w: +el.getAttribute("width"), h: +el.getAttribute("height") } : null);

    const nodeEls = [...svg.querySelectorAll("[data-tax-node]")].map((g) => {
      const chipRect = g.querySelector("rect[data-tax-chip]");
      const chipCircle = g.querySelector("circle[data-tax-chip]");
      const labelEl = g.querySelector("[data-tax-label]");
      const vchipEl = g.querySelector("[data-tax-vchip]");
      // transform-blind LAYOUT box: the chip <rect>'s own attrs (stable), or the hub circle's box.
      let layout = null;
      if (chipRect) layout = rectAttr(chipRect);
      else if (chipCircle) {
        const r = +chipCircle.getAttribute("r");
        layout = { x: +chipCircle.getAttribute("cx") - r, y: +chipCircle.getAttribute("cy") - r, w: 2 * r, h: 2 * r };
      }
      const chip = chipRect || chipCircle;
      return {
        rank: +g.getAttribute("data-tax-rank"),
        cat: g.getAttribute("data-tax-cat") != null ? +g.getAttribute("data-tax-cat") : -1,
        accent: g.getAttribute("data-tax-accent"),
        isRoot: g.hasAttribute("data-tax-root"),
        layout,
        // PAINTED box (transform-aware — the pop is visible here), canvas-local CSS px.
        painted: chip ? localOf(chip) : null,
        fill: chip ? getComputedStyle(chip).fill : null,
        transform: getComputedStyle(g).transform,
        label: labelEl
          ? { text: labelEl.textContent, rect: localOf(labelEl), fontSize: parseFloat(getComputedStyle(labelEl).fontSize), opacity: parseFloat(getComputedStyle(g).opacity) }
          : null,
        vchip: vchipEl
          ? { text: vchipEl.textContent, rect: localOf(vchipEl), fontSize: parseFloat(getComputedStyle(vchipEl).fontSize), opacity: parseFloat(getComputedStyle(g).opacity) }
          : null,
      };
    });

    const linkEls = [...svg.querySelectorAll("[data-tax-link]")].map((p) => {
      const d = p.getAttribute("d") || "";
      // endpoints: the first M point and the final point of the path `d` (parent bottom → child top).
      const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      const x1 = nums[0];
      const y1 = nums[1];
      const x2 = nums[nums.length - 2];
      const y2 = nums[nums.length - 1];
      const cs = getComputedStyle(p);
      return {
        mode: p.getAttribute("data-tax-link-mode"),
        parent: +p.getAttribute("data-tax-link-parent"),
        child: +p.getAttribute("data-tax-link-child"),
        x1,
        y1,
        x2,
        y2,
        rect: localOf(p),
        strokeW: parseFloat(cs.strokeWidth),
        dashoffset: parseFloat(cs.strokeDashoffset),
        reveal: p.getAttribute("data-tax-link-reveal") != null ? +p.getAttribute("data-tax-link-reveal") : null,
      };
    });

    return {
      mode: svg.getAttribute("data-tax-mode"),
      empty: svg.hasAttribute("data-tax-empty"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      // PL-0.8 — the RENDERED (row-aware) viewBox dims; qa-taxonomy recomputes the ranks from viewH.
      viewW: vb[2] || 1000,
      viewH: vb[3] || 640,
      nodeCount: svg.querySelectorAll("*").length,
      nodeTotal: nodeEls.length,
      linkCount: linkEls.length,
      nodes: nodeEls,
      links: linkEls,
    };
  })();

  // ── PL-4.3 ComparisonMatrix geometry ──────────────────────────────────────────
  // CSS-GRID primitive (NOT an SVG viewBox): a 3×3 grid (row1 = col headers, col1 = row headers, the
  // 2×2 = data cells). Reports the grid template (cols/rows/gap) + node count + the 9 grid children's
  // transform-blind LAYOUT boxes (cumulative offset* — the per-cell reveal animates a scale/translate
  // CSS transform, so the painted bbox shifts mid-reveal by design; the LAYOUT box is the stable
  // geometry C-layout-reserved constrains) + per-child opacity + the reveal transform. Splits the data
  // cells (tl/tr/bl/br) out with their value (FitLine-zoom-aware effective font) + delta (text/font/
  // opacity) + highlighted flag (the accent ring vs the neutral ring, read off the box-shadow). The
  // headers carry text/effective-font/transform/family for the C2 mono-uppercase check. Sampled across
  // `t` by tools/qa-matrix.mjs to assert C1 (fixed 3×3 / node count constant), C-layout-reserved,
  // C2/C3/C4 (fonts), C6 (delta fit-or-hide reproduced), C8 (highlight), settle, mobile floors.
  // ── PL-4.3 RangeBars geometry ───────────────────────────────────────────────
  // SVG viewBox primitive (viewBox 1000×560, like Divergence/BarChart). Reports the svg rect +
  // scaleX/scaleY + node count, PER BAR the transform-blind LAYOUT box (the <rect>'s viewBox x/y/w/h
  // attrs — the stable geometry, never a fn of a reveal), the group labels + row labels + axis tick
  // labels (text/eff-font/family/anchor/rect), the per-lane GROUP opacity (the reveal mechanism is
  // group opacity ONLY — RangeBars wraps each lane/axis/marketLine in an <g opacity=…>), and the
  // optional marketLine (x1/x2/dasharray). Sampled across `t` (over the reveal props) by
  // tools/qa-ranges.mjs to assert C1 (geometry static / node count constant), C2 (bars-within-viewBox),
  // C3 (bar height), C4/C5 (fonts + label column), C6 (no row-label overlap), C-reveal/C-settle, C-mobile.
  //
  // NOTE: the bar <rect>s carry NO text node, so (like scatter dots / donut arcs) they are never in
  // `measured` and cannot trip the gating collisions scan — only the genuine text labels are.
  const ranges = (() => {
    let svg = canvas.querySelector("[data-ranges]");
    if (!svg) {
      // fallback (pre-retrofit code has no hook): the svg with the RangeBars signature viewBox.
      for (const s of canvas.querySelectorAll("svg")) {
        if ((s.getAttribute("viewBox") || "").trim() === "0 0 1000 560") { svg = s; break; }
      }
    }
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 560").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 560);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const numAttr = (el, a) => { const v = el.getAttribute(a); return v == null ? null : +v; };
    const effFont = (el) => {
      let z = 1;
      for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
        const zv = parseFloat(getComputedStyle(n).zoom);
        if (Number.isFinite(zv) && zv > 0) z *= zv;
      }
      return +(parseFloat(getComputedStyle(el).fontSize) * z).toFixed(2);
    };
    // Bars: prefer the hook, fall back to every <rect> (pre-retrofit has no hook). The bar's stable
    // LAYOUT is its own viewBox attrs (x/y/w/h), transform-blind — never a fn of a reveal.
    const barEls = svg.querySelector("[data-ranges-bar]")
      ? [...svg.querySelectorAll("[data-ranges-bar]")]
      : [...svg.querySelectorAll("rect")];
    const bars = barEls.map((el) => ({
      x: numAttr(el, "x"), y: numAttr(el, "y"), w: numAttr(el, "width"), h: numAttr(el, "height"),
      fill: getComputedStyle(el).fill,
    }));
    // Group labels (the two lane eyebrows) — hook or, pre-retrofit, the mono eyebrow <text> (anchor
    // start at x20). Row labels — hook or, pre-retrofit, the end-anchored Space-Grotesk <text>.
    const textProbe = (el) => {
      const s = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim(),
        x: numAttr(el, "x"),
        anchor: el.getAttribute("text-anchor") || s.textAnchor,
        fontSize: effFont(el),
        fontFamily: s.fontFamily.split(",")[0].replace(/['"]/g, ""),
        fill: s.fill,
        rect: localOf(el),
      };
    };
    let groupLabels, rowLabels;
    if (svg.querySelector("[data-ranges-grouplabel]")) {
      groupLabels = [...svg.querySelectorAll("[data-ranges-grouplabel]")].map(textProbe);
      rowLabels = [...svg.querySelectorAll("[data-ranges-rowlabel]")].map(textProbe);
    } else {
      const allText = [...svg.querySelectorAll("text")];
      groupLabels = allText
        .filter((el) => (el.getAttribute("text-anchor") || "") !== "end" && +el.getAttribute("x") < 40 && /mono|JetBrains/i.test(getComputedStyle(el).fontFamily))
        .map(textProbe);
      rowLabels = allText
        .filter((el) => (el.getAttribute("text-anchor") || getComputedStyle(el).textAnchor) === "end")
        .map(textProbe);
    }
    // Per-lane/axis/marketLine GROUP opacity (the reveal mechanism). Prefer the hook; pre-retrofit the
    // lanes are bare <g opacity=…> wrappers — collect every direct <g> child carrying an opacity.
    let groups;
    if (svg.querySelector("[data-ranges-group]")) {
      groups = [...svg.querySelectorAll("[data-ranges-group]")].map((g) => ({
        role: g.getAttribute("data-ranges-group"),
        opacity: +parseFloat(getComputedStyle(g).opacity).toFixed(3),
      }));
    } else {
      groups = [...svg.querySelectorAll(":scope > g")].map((g, i) => ({
        role: `g${i}`,
        opacity: +parseFloat(getComputedStyle(g).opacity).toFixed(3),
      }));
    }
    // marketLine — hook, or the dashed violet vertical line (pre-retrofit).
    let mlEl = svg.querySelector("[data-ranges-marketline]");
    if (!mlEl) {
      mlEl = [...svg.querySelectorAll("line")].find((l) => {
        const da = getComputedStyle(l).strokeDasharray;
        return da && da !== "none" && l.getAttribute("x1") === l.getAttribute("x2");
      }) || null;
    }
    const marketLine = mlEl
      ? { x1: numAttr(mlEl, "x1"), y1: numAttr(mlEl, "y1"), x2: numAttr(mlEl, "x2"), y2: numAttr(mlEl, "y2"), dasharray: getComputedStyle(mlEl).strokeDasharray }
      : null;
    return {
      viewBox: svg.getAttribute("viewBox"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      barCount: bars.length,
      bars,
      groupLabels,
      rowLabels,
      groups,
      marketLine,
    };
  })();

  const matrix = (() => {
    const root = canvas.querySelector("[data-matrix]");
    if (!root) return null;
    const cs0 = getComputedStyle(root);
    const layoutOf = (el) => {
      let left = 0, top = 0;
      for (let n = el; n; n = n.offsetParent) { left += n.offsetLeft; top += n.offsetTop; }
      return { x: +left.toFixed(2), y: +top.toFixed(2), w: el.offsetWidth, h: el.offsetHeight };
    };
    const effFont = (el) => {
      // declared font-size × cumulative zoom up to the canvas (FitLine zooms the value span).
      let z = 1;
      for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
        const zv = parseFloat(getComputedStyle(n).zoom);
        if (Number.isFinite(zv) && zv > 0) z *= zv;
      }
      return +(parseFloat(getComputedStyle(el).fontSize) * z).toFixed(2);
    };
    const textProbe = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        fontSize: effFont(el),
        textTransform: s.textTransform,
        fontFamily: s.fontFamily.split(",")[0].replace(/['"]/g, ""),
        color: s.color,
        rect: toLocal(el.getBoundingClientRect()),
      };
    };

    const cellEls = [...root.children];
    const cells = cellEls.map((child) => {
      const cs = getComputedStyle(child);
      return {
        role: child.getAttribute("data-matrix-cell") || null, // "spacer" | "colhdr" | "rowhdr" | "tl"/"tr"/"bl"/"br"
        layout: layoutOf(child),
        rect: toLocal(child.getBoundingClientRect()),
        opacity: +parseFloat(cs.opacity).toFixed(3),
        transform: cs.transform,
      };
    });

    const headers = [...root.querySelectorAll("[data-matrix-header]")].map((el) => ({
      kind: el.getAttribute("data-matrix-header"), // "col" | "row"
      ...textProbe(el),
    }));

    const dataCells = [...root.querySelectorAll("[data-matrix-data]")].map((g) => {
      const valueZone = g.querySelector("[data-matrix-value]"); // FitLine's layout-true zone div
      // The value's effective size lives on the zoomed SPAN inside the zone (FitLine zooms the span,
      // and getComputedStyle reports the PRE-zoom fontSize) — read the span, not the zone.
      const valueSpan = valueZone ? valueZone.firstElementChild : null;
      const deltaEl = g.querySelector("[data-matrix-delta]");
      const cs = getComputedStyle(g);
      return {
        key: g.getAttribute("data-matrix-data"), // "tl" | "tr" | "bl" | "br"
        // The highlight signal: the accent ring is a wider/colored box-shadow flagged by the hook.
        highlighted: g.getAttribute("data-matrix-highlight") === "1",
        opacity: +parseFloat(cs.opacity).toFixed(3),
        value: valueSpan
          ? { text: (valueSpan.textContent || "").trim(), fontSize: effFont(valueSpan), rect: toLocal(valueZone.getBoundingClientRect()) }
          : valueZone
            ? { text: (valueZone.textContent || "").trim(), fontSize: effFont(valueZone), rect: toLocal(valueZone.getBoundingClientRect()) }
            : null,
        delta: deltaEl
          ? { text: (deltaEl.textContent || "").trim(), fontSize: parseFloat(getComputedStyle(deltaEl).fontSize), opacity: parseFloat(getComputedStyle(deltaEl).opacity), rect: toLocal(deltaEl.getBoundingClientRect()) }
          : null,
      };
    });

    return {
      cols: (cs0.gridTemplateColumns || "").trim().split(/\s+/).filter(Boolean),
      rows: (cs0.gridTemplateRows || "").trim().split(/\s+/).filter(Boolean),
      gap: cs0.gap,
      rect: toLocal(root.getBoundingClientRect()),
      nodeCount: root.querySelectorAll("*").length,
      childCount: cellEls.length,
      cells,
      headers,
      dataCells,
    };
  })();

  // ── PL-4.3 Pipeline geometry ─────────────────────────────────────────────────
  // SVG viewBox primitive (viewBox 1000×280, like Divergence/RangeBars). Reports the svg rect +
  // scaleX/scaleY + node count, PER CHIP the transform-blind LAYOUT box (the <rect>'s viewBox x/y/w/h
  // attrs — the stable geometry, never a fn of a reveal) + the per-node GROUP opacity (the reveal
  // mechanism is group opacity + the chip stroke "lit" color ONLY), the per-step eyebrow + node step
  // labels + cumulative labels (text/eff-font/family/anchor/rect/opacity), the endpoint (endLabel +
  // END-TO-END, group opacity), and the OPTIONAL signal dot (cx/cy/r — present only mid-travel; the
  // legacy hides it at signalProgress<0.002 / >0.998). Sampled across `t` (over the reveal props) by
  // tools/qa-pipeline.mjs to assert C1 (geometry static / chip count constant), C2 (chips-within-frame),
  // C4 (signal-dot on track), C5 (fonts), no-label-overlap, C-reveal/C-settle, C6 (the MAX_NODES cap),
  // C-mobile.
  //
  // NOTE: the chip <rect>s / connector <line>s / signal <circle> carry NO text node, so (like scatter
  // dots / donut arcs) they are never in `measured` and cannot trip the gating collisions scan — only
  // the genuine text labels (per-step, step "NN", cumulative, endLabel) are.
  const pipeline = (() => {
    let svg = canvas.querySelector("[data-pipeline]");
    if (!svg) {
      // fallback (pre-retrofit code has no hook): the svg with the Pipeline signature viewBox.
      for (const s of canvas.querySelectorAll("svg")) {
        if ((s.getAttribute("viewBox") || "").trim() === "0 0 1000 280") { svg = s; break; }
      }
    }
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const vb = (svg.getAttribute("viewBox") || "0 0 1000 280").split(/\s+/).map(Number);
    const scaleX = sr.width / (vb[2] || 1000);
    const scaleY = sr.height / (vb[3] || 280);
    const localOf = (el) => toLocal(el.getBoundingClientRect());
    const numAttr = (el, a) => { const v = el.getAttribute(a); return v == null ? null : +v; };
    const effFont = (el) => {
      let z = 1;
      for (let n = el; n && n !== canvas.parentElement; n = n.parentElement) {
        const zv = parseFloat(getComputedStyle(n).zoom);
        if (Number.isFinite(zv) && zv > 0) z *= zv;
      }
      return +(parseFloat(getComputedStyle(el).fontSize) * z).toFixed(2);
    };
    const textProbe = (el) => {
      const s = getComputedStyle(el);
      return {
        text: (el.textContent || "").trim(),
        x: numAttr(el, "x"),
        anchor: el.getAttribute("text-anchor") || s.textAnchor,
        fontSize: effFont(el),
        fontFamily: s.fontFamily.split(",")[0].replace(/['"]/g, ""),
        fill: s.fill,
        opacity: +parseFloat(s.opacity).toFixed(3),
        rect: localOf(el),
      };
    };
    // Chips: prefer the hook, fall back to every <rect> (pre-retrofit has no hook). The chip's stable
    // LAYOUT is its own viewBox attrs (x/y/w/h), transform-blind — never a fn of a reveal.
    const chipEls = svg.querySelector("[data-pipeline-chip]")
      ? [...svg.querySelectorAll("[data-pipeline-chip]")]
      : [...svg.querySelectorAll("rect")];
    const chips = chipEls.map((el) => {
      const cs = getComputedStyle(el);
      // The chip's effective opacity is its own × the node <g> wrapper's (the reveal lives on the <g>).
      let op = 1;
      for (let n = el; n && n !== svg.parentElement; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || "1");
      return {
        x: numAttr(el, "x"), y: numAttr(el, "y"), w: numAttr(el, "width"), h: numAttr(el, "height"),
        fill: cs.fill,
        stroke: cs.stroke,
        opacity: +op.toFixed(3),
      };
    });
    // Labels — hook (post-retrofit) or, pre-retrofit, by structure: the per-step eyebrow is the mono
    // <text> at x<40 anchored start; node step "NN" is the centered mono; cumulative is the centered
    // Space Grotesk below the chip.
    let perStep, stepLabels, cumulativeLabels;
    if (svg.querySelector("[data-pipeline-step]")) {
      const ps = svg.querySelector("[data-pipeline-perstep]");
      perStep = ps ? textProbe(ps) : null;
      stepLabels = [...svg.querySelectorAll("[data-pipeline-step]")].map(textProbe);
      cumulativeLabels = [...svg.querySelectorAll("[data-pipeline-cumulative]")].map(textProbe);
    } else {
      const allText = [...svg.querySelectorAll("text")];
      perStep = (() => {
        const el = allText.find((t) => (t.getAttribute("text-anchor") || "") !== "middle" && +t.getAttribute("x") < 40 && /mono|JetBrains/i.test(getComputedStyle(t).fontFamily) && +t.getAttribute("y") < 60);
        return el ? textProbe(el) : null;
      })();
      stepLabels = allText
        .filter((t) => (t.getAttribute("text-anchor") || getComputedStyle(t).textAnchor) === "middle" && /mono|JetBrains/i.test(getComputedStyle(t).fontFamily) && Math.abs(parseFloat(getComputedStyle(t).fontSize) - 22) < 1)
        .map(textProbe);
      cumulativeLabels = allText
        .filter((t) => (t.getAttribute("text-anchor") || getComputedStyle(t).textAnchor) === "middle" && /Grotesk/i.test(getComputedStyle(t).fontFamily))
        .map(textProbe);
    }
    // Endpoint group (endLabel + END-TO-END) — its effective opacity (the reveal).
    let endpoint;
    const epEl = svg.querySelector("[data-pipeline-endpoint]");
    const endLabelEl = svg.querySelector("[data-pipeline-endlabel]") ||
      [...svg.querySelectorAll("text")].find((t) => Math.abs(parseFloat(getComputedStyle(t).fontSize) - 72) < 2);
    if (endLabelEl) {
      const grp = epEl || endLabelEl.parentElement;
      endpoint = {
        ...textProbe(endLabelEl),
        opacity: +parseFloat(getComputedStyle(grp).opacity).toFixed(3),
      };
    } else endpoint = null;
    // Per-group opacity (reveal mechanism). Prefer hooks; pre-retrofit they are bare <g opacity=…>.
    let groups;
    if (svg.querySelector("[data-pipeline-node], [data-pipeline-connector], [data-pipeline-endpoint]")) {
      groups = [...svg.querySelectorAll("[data-pipeline-node], [data-pipeline-connector], [data-pipeline-endpoint]")].map((g, i) => ({
        i,
        opacity: +parseFloat(getComputedStyle(g).opacity).toFixed(3),
      }));
    } else {
      groups = [...svg.querySelectorAll(":scope > g")].map((g, i) => ({
        i,
        opacity: +parseFloat(getComputedStyle(g).opacity).toFixed(3),
      }));
    }
    // The signal dot — present only mid-travel (the legacy hides it at the endpoints).
    const dotEl = svg.querySelector("[data-pipeline-signal]") || svg.querySelector("circle");
    const signalDot = dotEl
      ? { cx: numAttr(dotEl, "cx"), cy: numAttr(dotEl, "cy"), r: numAttr(dotEl, "r"), fill: getComputedStyle(dotEl).fill }
      : null;
    return {
      viewBox: svg.getAttribute("viewBox"),
      rect: toLocal(sr),
      scaleX: +scaleX.toFixed(4),
      scaleY: +scaleY.toFixed(4),
      nodeCount: svg.querySelectorAll("*").length,
      chipCount: chips.length,
      chips,
      perStep,
      stepLabels,
      cumulativeLabels,
      endpoint,
      groups,
      signalDot,
    };
  })();

  const pass =
    collisions.length === 0 &&
    outOfSafeMargin.length === 0 &&
    belowMobileFloor.length === 0 &&
    clipped.length === 0 &&
    textOccluded.length === 0 &&
    textOverflowsBox.length === 0 &&
    !crowded &&
    signaturePresent;

  return {
    canvas: { width: W, height: H },
    measuredCount: measured.length,
    pass,
    collisions,
    outOfSafeMargin,
    belowMobileFloor,
    clipped,
    textOccluded,
    textOverflowsBox,
    marksUnlabeled,
    lowContrast,
    crowded,
    crowdedCap,
    textCoverage,
    crampedPairs,
    signaturePresent,
    signatureOpacity,
    texts,
    anchors,
    hierarchyRatio,
    typo,
    duplicates,
    bottomReserve,
    balanceX,
    balanceY,
    accentHues,
    metricCards,
    statHero,
    decompBar,
    claimList,
    comparison,
    divergence,
    tiers,
    bars,
    scatter,
    donut,
    area,
    histogram,
    line,
    funnel,
    candles,
    distribution,
    taxonomy,
    ranges,
    matrix,
    pipeline,
  };
}

// The inspect browser may render MODEL-AUTHORED (untrusted) TSX during Path B generation. A page's
// one dangerous capability is NETWORK — it can't touch host files/procs (Chromium sandbox), but a
// malicious component could fetch()/WebSocket/<img>-beacon to exfiltrate or attack. So in production
// we deny it ALL network except the local origin it must load from (the dev server). Fonts are bundled
// (data-URI) so the page needs zero external network. Local origins that are always allowed:
const LOCAL_ORIGIN = /^(https?|ws|wss):\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
const LOCAL_SCHEME = /^(data|blob|about):/i; // inline resources — never touch the network

// Attach a deny-all-egress guard to a Playwright page. Returns the array of BLOCKED request URLs
// (for the red-team smoke to assert on). Off unless ISOLATE_INSPECT is set — local dev/QA is trusted
// and unchanged; the server sets ISOLATE_INSPECT=1. See planning/PATH-B-GENERATION-ISOLATION.md.
export async function isolatePageEgress(page) {
  const blocked = [];
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (LOCAL_SCHEME.test(u) || LOCAL_ORIGIN.test(u)) return route.continue();
    blocked.push(u);
    return route.abort("blockedbyclient");
  });
  // page.route does NOT intercept WebSocket/EventSource/WebRTC — stub them in the page so a
  // malicious component can't open a raw socket past the request interception. Local WS stays
  // allowed (Vite HMR). Blocked attempts are reported back for the red-team smoke.
  await page.exposeFunction("__egressBlocked", (u) => blocked.push(String(u).slice(0, 300)));
  await page.addInitScript(() => {
    const LOCAL = /^(wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
    const report = (u) => { try { window.__egressBlocked(u); } catch { /* binding gone */ } };
    const NativeWS = window.WebSocket;
    const GuardedWS = function (url, protos) {
      if (LOCAL.test(String(url))) return new NativeWS(url, protos);
      report(url);
      throw new DOMException("egress blocked", "SecurityError");
    };
    GuardedWS.prototype = NativeWS.prototype;
    GuardedWS.CONNECTING = NativeWS.CONNECTING; GuardedWS.OPEN = NativeWS.OPEN;
    GuardedWS.CLOSING = NativeWS.CLOSING; GuardedWS.CLOSED = NativeWS.CLOSED;
    window.WebSocket = GuardedWS;
    window.EventSource = function (url) { report(url); throw new DOMException("egress blocked", "SecurityError"); };
    const NoRTC = function () { report("rtc:"); throw new DOMException("egress blocked", "SecurityError"); };
    window.RTCPeerConnection = NoRTC;
    window.webkitRTCPeerConnection = NoRTC;
  });
  return blocked;
}

export async function inspectLayout({ url, timeoutMs = 20000, screenshotPath, vizShotPath } = {}) {
  const { chromium } = await import("playwright"); // lazy (devDependency; see top-of-file note)
  // In the hardened isolation container (ISOLATE_INSPECT) Chromium runs as non-root with caps dropped,
  // so its setuid sandbox can't initialize — disable it (the OUTER gVisor + container + network-block
  // are the sandbox). Local/dev keeps Chromium's own sandbox on.
  // --no-proxy-server: the inspect browser only loads the LOCAL Vite preview; it must NOT pick up the
  // gen container's HTTP(S)_PROXY env (pointing at the egress-guard) and tunnel localhost through it.
  // Its external egress is already blocked by isolatePageEgress (control #1), independent of any proxy.
  const browser = await chromium.launch(
    process.env.ISOLATE_INSPECT ? { args: ["--no-sandbox", "--disable-setuid-sandbox", "--no-proxy-server"] } : {},
  );
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 2080 }, deviceScaleFactor: 1 }); // tall enough for 1080×1920 (9:16); all checks are canvas-relative so shorter formats are unaffected
    const blockedEgress = process.env.ISOLATE_INSPECT ? await isolatePageEgress(page) : null;
    // Capture the page's OWN errors — attached BEFORE goto: a model-authored component that crashes at
    // MODULE LOAD (bad import — the dominant crash class) throws DURING goto; listeners attached after
    // goto miss it, which is exactly why the first shipped version of this capture stayed empty. The
    // real ReferenceError/import failure turns a 5-iteration guessing crash-loop into a one-step fix.
    const pageErrors = [];
    page.on("pageerror", (e) => { if (pageErrors.length < 5) pageErrors.push(String(e?.message || e).slice(0, 200)); });
    page.on("console", (m) => { if (m.type() === "error" && pageErrors.length < 5) pageErrors.push(String(m.text()).slice(0, 200)); });
    // A failed MODULE load (bad import path → Vite 500/404) is the dominant crash class — name the
    // exact module URL, and for a Vite transform error pull the response body's first line, which
    // carries the money quote ("Failed to resolve import \"…\""). Async best-effort push: the reader
    // races the waitForSelector timeout, and a late line simply misses the message (never throws).
    page.on("response", (r) => {
      if (r.status() < 400 || pageErrors.length >= 5) return;
      const head = `HTTP ${r.status()} loading ${r.url().slice(0, 160)}`;
      r.text().then(
        (body) => { const line = String(body || "").split("\n").find((l) => l.trim()) || ""; pageErrors.push(`${head}${line ? ` — ${line.slice(0, 200)}` : ""}`); },
        () => pageErrors.push(head),
      );
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    let canvas;
    try {
      canvas = await page.waitForSelector("#post-canvas", { timeout: timeoutMs });
    } catch (e) {
      // Two crash shapes need two messages: WITH page errors → name them (bad import / runtime throw).
      // WITHOUT any error → the page loaded fine but the canvas never appeared: the component mounts
      // nothing (missing PostFrame root / a hung suspense / early return null) — telling the agent
      // "likely a runtime error" here sent it typechecking clean code in circles.
      const detail = pageErrors.length
        ? ` | page errors: ${pageErrors.slice(0, 3).join(" · ")}`
        : " | NO page errors were thrown — the page loaded but #post-canvas never appeared: the component likely renders nothing (its default export must return <PostFrame …> synchronously; no async component, no conditional early-return null at t=1)";
      // SINGLE LINE: downstream formatters keep only the first line of this message (qa.mjs wraps it
      // into the render finding via split("\n")[0]) — appending the diagnosis after Playwright's
      // multi-line call log silently dropped it, and two crash-loops shipped with a bare timeout.
      const firstLine = String(e?.message || e).split("\n")[0];
      throw new Error(`${firstLine}${detail}`);
    }
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(350); // settle fonts/animations to final state
    const report = await page.evaluate(measure);
    if (screenshotPath) {
      await canvas.screenshot({ path: screenshotPath });
      report.screenshot = screenshotPath;
    }
    // Isolated screenshot of just the VISUALIZATION region (PostFrame's <main data-viz>) — the anti-frozen
    // check (qa.mjs) diffs this region across two frames to see if the main visual actually animates.
    if (vizShotPath) {
      const vizEl = await page.$("#post-canvas [data-viz]");
      if (vizEl) { await vizEl.screenshot({ path: vizShotPath }); report.vizShot = vizShotPath; }
    }
    if (blockedEgress) report.blockedEgress = blockedEgress; // egress the untrusted page attempted (all denied)
    return report;
  } finally {
    await browser.close();
  }
}
