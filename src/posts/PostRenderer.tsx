// Path A universal renderer: RenderPost JSON -> pixels via the fixed primitives.
// Motion-capable (drives reveals from a single `t`). No AI-authored code runs here.
import { PostFrame } from "@/components/layout/PostFrame";
import { Panel } from "@/components/primitives/Panel";
import { FitZone } from "@/components/primitives/FitZone";
import { MetricCard } from "@/components/primitives/MetricCard";
import { LineChart, type LineSeries } from "@/components/primitives/LineChart";
import { ClaimList } from "@/components/primitives/ClaimList";
import { Pipeline } from "@/components/primitives/Pipeline";
import { DecompBar } from "@/components/primitives/DecompBar";
import { RangeBars } from "@/components/primitives/RangeBars";
import { ComparisonMatrix } from "@/components/primitives/ComparisonMatrix";
import { ComparisonColumns } from "@/components/primitives/ComparisonColumns";
import { StatHero } from "@/components/primitives/StatHero";
import { Divergence } from "@/components/primitives/Divergence";
import { TierStack } from "@/components/primitives/TierStack";
import { BarChart } from "@/components/primitives/BarChart";
import { ScatterPlot } from "@/components/primitives/ScatterPlot";
import { Donut } from "@/components/primitives/Donut";
import { AreaChart } from "@/components/primitives/AreaChart";
import { HistogramChart } from "@/components/primitives/HistogramChart";
import { Funnel } from "@/components/primitives/Funnel";
import { Candlestick } from "@/components/primitives/Candlestick";
import { Distribution } from "@/components/primitives/Distribution";
import { Taxonomy } from "@/components/primitives/Taxonomy";
import { colors } from "@/tokens/design";
import { appear } from "@/lib/reveal";
import { planStack } from "@/lib/stack";
import { planNarrative } from "@/lib/narrative";
import type { RenderPost, RenderViz, Accent } from "./renderTypes";

const accentHex = (a: Accent = "cyan") => colors.accent[a] ?? colors.accent.cyan;

function Viz({ viz, t }: { viz: RenderViz; t: number }) {
  if (viz.kind === "chart") {
    const series: LineSeries[] = viz.series.slice(0, 4).map((s) => ({
      label: s.label,
      values: s.values,
      color: accentHex(s.color),
      endValueLabel: s.endValueLabel,
    }));
    // PL-2.7 additive knobs (default absent → plain line, byte-identical). The trace draw-on reveal is
    // appear(t,0.35,0.45) == lineReveal(t); markers/area-clip/annotations derive their timing from it.
    return (
      <Panel label={viz.caption ?? "end-to-end reliability vs. steps"}>
        {/* PL-0.9: bind viz to the Panel box (PL-0.8 Donut/divergence pattern) at the SVG's native
            920×390 (=92/39) aspect, so dense content can't grow the row past the frame (eyebrow clip
            + footer breach). The aspect-matched box ⇒ preserveAspectRatio=meet fills edge-to-edge (no
            letterbox) → painted geometry stays proportional to the viewBox, so the PL-2.7 byte-identity
            baseline holds for content that already fit. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[92/39] h-full max-h-full max-w-full">
            <LineChart
              series={series}
              xLabels={viz.xLabels}
              yMin={viz.yMin ?? 0}
              yMax={viz.yMax ?? 1}
              height={390}
              reveal={appear(t, 0.35, 0.45)}
              variant={viz.variant}
              markers={viz.markers}
              annotations={viz.annotations}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "comparison") {
    // PL-1.5: promoted to ComparisonColumns (Path B importable). The per-column/per-item
    // staggered reveal lives in the component; t=1 output is structurally identical to the
    // pre-promotion inline render (gated by tools/qa-reveal.mjs against a captured baseline).
    // PL-4.1: the optional revealMode knob (default "paired" → byte-identical). Two narrative
    // variants — "sequential" (both boxes side-by-side, left-then-right) and "sequentialCentered"
    // (moving boxes); both share the SAME plan/timing (derived once here).
    const revealMode =
      viz.revealMode === "sequential" ? "sequential" : viz.revealMode === "sequentialCentered" ? "sequentialCentered" : "paired";
    const narrative =
      revealMode !== "paired"
        ? planNarrative("sequential", { left: viz.left.items ?? [], right: viz.right.items ?? [] })
        : undefined;
    return <ComparisonColumns left={viz.left} right={viz.right} t={t} revealMode={revealMode} narrative={narrative} />;
  }
  if (viz.kind === "claims") {
    // PL-4.1: the optional revealMode knob (default "stagger" → byte-identical). "spotlight" derives
    // the NarrativePlan once here and passes it + the RAW global t to ClaimList.
    const revealMode = viz.revealMode === "spotlight" ? "spotlight" : "stagger";
    const entries = viz.entries.slice(0, 4).map((e, i) => ({
      id: String(i),
      date: e.date,
      source: e.source,
      claim: e.claim,
      reality: e.reality,
      realityNote: e.note,
    }));
    const narrative =
      revealMode === "spotlight"
        ? planNarrative(
            "spotlight",
            entries.map((e) => ({ claim: e.claim, reality: e.reality, realityNote: e.realityNote })),
          )
        : undefined;
    return (
      <FitZone align="center">
      <Panel label={viz.caption ?? "claims vs. reality"}>
        <ClaimList
          entries={entries}
          entriesReveal={appear(t, 0.2, 0.55)}
          revealMode={revealMode}
          t={t}
          narrative={narrative}
        />
      </Panel>
      </FitZone>
    );
  }
  if (viz.kind === "pipeline") {
    return (
      <Panel label={viz.caption ?? "compounding across steps"}>
        {/* PL-0.9: bind viz to the Panel box (PL-0.8 Donut/divergence pattern) at the SVG's native
            1000×280 (=25/7) aspect, so dense chrome can't grow the row past the frame (eyebrow clip
            + footer breach). The aspect-matched box ⇒ preserveAspectRatio=meet fills edge-to-edge (no
            letterbox) → painted geometry stays proportional to the viewBox, so the PL-4.3 byte-identity
            baseline holds for content that already fit. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[25/7] h-full max-h-full max-w-full">
            <Pipeline
              nodes={viz.nodes.map((n) => ({ step: n.step, cumulativeLabel: n.cumulative }))}
              perStepLabel={viz.perStepLabel}
              endLabel={viz.endLabel}
              endAccent={viz.endAccent ?? "burnt"}
              nodesReveal={appear(t, 0.2, 0.3)}
              signalProgress={appear(t, 0.4, 0.45)}
              endpointReveal={appear(t, 0.7, 0.2)}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "stack") {
    // PL-1.3: planStack owns the defensive clamps — 5-segment cap, sum-to-1 normalization,
    // 0.02 sliver floor, and the label show/hide decision (a label that doesn't provably fit
    // its segment is hidden entirely, never truncated — the bleed-defect fix). The wrapper
    // fade tightens to [0.30, 0.36] so the ring outlines the whole before the fills compose
    // it left→right (§2.5.3); containLabels adds the hard C5 containment (Path A always on).
    return (
      <FitZone align="center">
      <Panel label={viz.caption ?? "composition"}>
        <div className="flex h-full items-center" style={{ opacity: appear(t, 0.3, 0.06) }}>
          <DecompBar
            segments={planStack(viz.segments).map((s) => ({
              width: s.fraction,
              color: accentHex(s.colorKey),
              label: s.label,
              labelInside: s.showLabel,
              labelColor: "#0E1116",
              labelSize: 26,
            }))}
            height={132}
            t={t}
            containLabels
          />
        </div>
      </Panel>
      </FitZone>
    );
  }
  if (viz.kind === "ranges") {
    // two-lane timeline/interval bars on a year axis. PL-4.3 retrofit: the per-lane row cap, accent
    // defaults, axis derivation-from-data, AND the maxYear≤minYear divide-by-zero guard now live in
    // planRanges (src/lib/ranges.ts) — RangeBars calls it internally, so this branch just derives the
    // concrete min/max its `number` props require (planRanges re-guards if maxYear≤minYear reaches it).
    const top = (viz.topEntries ?? []).slice(0, 4);
    const bottom = (viz.bottomEntries ?? []).slice(0, 4);
    const years = [...top, ...bottom].flatMap((e) => [e.start, e.end]).filter((n) => typeof n === "number" && !Number.isNaN(n));
    const minYear = viz.minYear ?? (years.length ? Math.min(...years) : 2024);
    const maxYear = viz.maxYear ?? (years.length ? Math.max(...years) : 2030);
    return (
      <Panel label={viz.caption ?? "timelines on a shared axis"}>
        {/* PL-0.9: bind viz to the Panel box (PL-0.8 Donut/divergence pattern) at the SVG's native
            1000×560 (=25/14) aspect, so dense content can't grow the row past the frame (eyebrow clip
            + footer breach). The aspect-matched box ⇒ preserveAspectRatio=meet fills edge-to-edge (no
            letterbox) → painted geometry stays proportional to the viewBox, so the PL-4.3 byte-identity
            baseline holds for content that already fit. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[25/14] h-full max-h-full max-w-full">
            <RangeBars
              topGroupLabel={viz.topGroupLabel ?? ""}
              bottomGroupLabel={viz.bottomGroupLabel ?? ""}
              topEntries={top.map((e, i) => ({ id: `t${i}`, label: e.label, start: e.start, end: e.end, openEnd: e.openEnd }))}
              bottomEntries={bottom.map((e, i) => ({ id: `b${i}`, label: e.label, start: e.start, end: e.end, openEnd: e.openEnd }))}
              topAccent={viz.topAccent ?? "cyan"}
              bottomAccent={viz.bottomAccent ?? "burnt"}
              minYear={minYear}
              maxYear={maxYear}
              marketLine={viz.marketLine}
              axisReveal={appear(t, 0.3, 0.3)}
              topLaneReveal={appear(t, 0.2, 0.5)}
              bottomLaneReveal={appear(t, 0.45, 0.5)}
              marketLineReveal={appear(t, 0.72, 0.28)}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "matrix") {
    // Defensive defaults — Anthropic's loose schema may omit cells/headers/accents.
    const cell = (c?: { value: string; delta?: string; accent?: Accent }) => ({ value: c?.value ?? "", delta: c?.delta, accent: c?.accent ?? "cyan" });
    const pair = (p: [string, string] | undefined): [string, string] => [p?.[0] ?? "", p?.[1] ?? ""];
    return (
      <FitZone align="center">
      <Panel label={viz.caption ?? "decision matrix"}>
        <div className="flex h-full items-center">
          <ComparisonMatrix
            rowHeaders={pair(viz.rowHeaders)}
            rowAccents={(viz.rowAccents ?? ["cyan", "burnt"]) as [Accent, Accent]}
            colHeaders={pair(viz.colHeaders)}
            tl={cell(viz.tl)}
            tr={cell(viz.tr)}
            bl={cell(viz.bl)}
            br={cell(viz.br)}
            highlightCell={viz.highlightCell ?? null}
            headersReveal={appear(t, 0.18, 0.2)}
            tlReveal={appear(t, 0.3, 0.18)}
            trReveal={appear(t, 0.42, 0.18)}
            blReveal={appear(t, 0.54, 0.18)}
            brReveal={appear(t, 0.66, 0.18)}
          />
        </div>
      </Panel>
      </FitZone>
    );
  }
  if (viz.kind === "divergence") {
    // PL-3.1: the gap between two paired values per item — dumbbell (default) or slope.
    // planDivergence (inside Divergence) owns all defensive clamps: ≤5 items, axis derivation
    // + guard, the C6 anti-collapse nudge, label show/hide, slope declutter, and the < 2-item
    // self-contained fallback. Anthropic's loose schema may omit axis/accents/mode — all derived.
    return (
      <Panel label={viz.caption ?? "expectation vs reality"}>
        {/* PL-0.7: bound the viz to the Panel box (absolute inset-0, mirrors Donut) at the SVG's
            native 1000×640 (=25/16) aspect, so it fits its row instead of overflowing it (its
            width-driven h-auto used to grow the grid past the frame). The aspect-matched box means
            preserveAspectRatio=meet fills edge-to-edge (no letterbox) → painted geometry stays
            proportional to the viewBox, so qa:divergence's scaleX assumption holds. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[25/16] h-full max-h-full max-w-full">
            <Divergence
            items={(viz.items ?? []).map((it) => ({
              label: it.label,
              start: it.start,
              end: it.end,
              startText: it.startText,
              endText: it.endText,
            }))}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            startAccent={viz.startAccent ?? "cyan"}
            endAccent={viz.endAccent ?? "burnt"}
            startLabel={viz.startLabel}
            endLabel={viz.endLabel}
            mode={viz.mode ?? "dumbbell"}
            caption={viz.caption}
            t={t}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "tiers") {
    // PL-3.2: items sorted into ordered buckets (default) or a ranked leaderboard. planTiers
    // (inside TierStack) owns all defensive clamps: ≤4 tiers, ≤5 items/tier, ≤12 total with a
    // deterministic last-tier-inward drop, the ≤2-row greedy bin-pack (≤1 two-row tier when
    // tiers≥4), chip show/hide on the FitLine floor, and accent role-mapping. The empty-state
    // is a caption-only Panel (no "no data" text — §3 ruling 3). Anthropic's loose schema may
    // omit tiers/mode/items — all defended; for now `tiers` is deferred from Anthropic entirely.
    return (
      <FitZone align="center">
      <Panel label={viz.caption ?? "ranked into tiers"}>
        <TierStack
          tiers={(viz.tiers ?? []).map((tier) => ({
            label: tier.label,
            accent: tier.accent,
            items: (tier.items ?? []).map((it) => ({ label: it.label, note: it.note })),
          }))}
          mode={viz.mode ?? "tiers"}
          showValue={viz.showValue}
          t={t}
        />
      </Panel>
      </FitZone>
    );
  }
  if (viz.kind === "bar") {
    // PL-2.1: compare N labelled magnitudes on one 0-anchored value axis. planBars (inside
    // BarChart) owns all defensive clamps: category/series/segment caps + surfaced drops, axis
    // derivation + max>min guard, the manual running-sum stacked offsets + per-bar sliver floor,
    // value/category label fit-or-hide, and the grow-from-baseline timing. Anthropic's loose
    // schema may omit any optional — all derived/defaulted; `bar` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "magnitude comparison"}>
        {/* PL-0.8: bind viz to the Panel box (Donut/divergence pattern) so dense chrome can't grow the row past the frame. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[25/16] h-full max-h-full max-w-full">
          <BarChart
            categories={(viz.categories ?? []).map((c) => ({
              label: c.label,
              value: c.value,
              values: c.values,
              valueText: c.valueText,
              accent: c.accent,
            }))}
            mode={viz.mode ?? "simple"}
            orientation={viz.orientation ?? "vertical"}
            valueLabels={viz.valueLabels ?? "auto"}
            sort={viz.sort ?? "none"}
            seriesLabels={viz.seriesLabels}
            seriesAccents={viz.seriesAccents}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            unit={viz.unit}
            referenceLine={viz.referenceLine}
            caption={viz.caption}
            t={t}
          />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "scatter") {
    // PL-2.2: a RELATIONSHIP between two numeric variables across N items. planScatter (inside
    // ScatterPlot) owns all defensive clamps: ≤20 points with even-stride downsample + invalid-point
    // drop (surfaced), per-dim axis derivation + 8% pad + max>min guard, the OLS least-squares trend
    // fit (suppressed on <2 distinct x — handles inverse slope) + Liang–Barsky clip, quadrant dividers
    // (author or data means) + region labels, and point/quad label fit-or-hide. Anthropic's loose
    // schema may omit any optional — all derived/defaulted; `scatter` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "relationship between two variables"}>
        {/* PL-0.8: bind viz to the Panel box. ScatterPlot is ROW-AWARE (measures this box's aspect →
            sets its viewBox height), so NO aspect wrapper — it fills the full row width, keeping dots
            ≥ the 6px mobile floor even in a wide-short row, with no overflow. */}
        <div className="absolute inset-0">
          <ScatterPlot
            points={(viz.points ?? []).map((p) => ({ x: p.x, y: p.y, label: p.label, accent: p.accent }))}
            xLabel={viz.xLabel}
            yLabel={viz.yLabel}
            xMin={viz.xMin}
            xMax={viz.xMax}
            yMin={viz.yMin}
            yMax={viz.yMax}
            xUnit={viz.xUnit}
            yUnit={viz.yUnit}
            trendLine={viz.trendLine ?? "off"}
            quadrants={viz.quadrants ?? "off"}
            xDivider={viz.xDivider}
            yDivider={viz.yDivider}
            quadrantLabels={viz.quadrantLabels}
            pointLabels={viz.pointLabels ?? "auto"}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  if (viz.kind === "donut") {
    // PL-2.3: the radial composition of ONE whole into a few parts. planDonut (inside Donut) owns
    // all defensive clamps: ≤6-segment cap + surfaced drops, sum-to-1 normalization, the 0.02
    // radial sliver floor, outside-label fit-or-hide (must stay in the safe frame), the center
    // headline derivation, and the continuous-edge sweep timing. Anthropic's loose schema may omit
    // any optional — all derived/defaulted; `donut` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "composition of a whole"}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-square h-full max-h-full max-w-full">
            <Donut
              segments={(viz.segments ?? []).map((s) => ({ label: s.label, value: s.value, accent: s.accent }))}
              centerLabel={viz.centerLabel}
              centerValue={viz.centerValue}
              valueLabels={viz.valueLabels ?? "auto"}
              centerTotal={viz.centerTotal ?? "on"}
              unit={viz.unit}
              emphasis={viz.emphasis}
              caption={viz.caption}
              t={t}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "area") {
    // PL-2.4: magnitude / volume under a curve over an ordered axis. planArea (inside AreaChart)
    // owns all defensive clamps: series cap (≤3) + per-series stride downsample (≤24) + truncate-to-
    // common-MIN-length (surfaced), 0-baseline axis derivation (per-x TOTAL for stacked / max for
    // simple) + max>min guard, the manual stacked cumulative sums + 14px layer-thickness floor, the
    // every-k x-label fit-or-hide + end-label fit/collision, and the left→right clip-rect reveal
    // timing. Anthropic's loose schema may omit any optional — all derived/defaulted; `area` is
    // deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "magnitude over an ordered axis"}>
        {/* PL-0.8: bind viz to the Panel box, full-bleed (the scatter/candlestick/histogram pattern) —
            the chart is row-aware and measures the TRUE row aspect; an aspect-pinned inner box would
            lock the measured aspect to the viewBox default and disable the row-aware fill. */}
        <div className="absolute inset-0">
          <AreaChart
            series={(viz.series ?? []).map((s) => ({
              label: s.label,
              values: s.values,
              accent: s.accent,
              endValueLabel: s.endValueLabel,
            }))}
            xLabels={viz.xLabels}
            mode={viz.mode ?? "simple"}
            valueLabels={viz.valueLabels ?? "auto"}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            unit={viz.unit}
            annotations={viz.annotations}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  if (viz.kind === "histogram") {
    // PL-2.6: the SHAPE / SPREAD of ONE metric across many observations — contiguous bins on a
    // numeric axis with a count y. planHistogram (inside HistogramChart) owns all defensive clamps:
    // the values-XOR-bins resolution (values win), clamped-Sturges [5,14] equal-width binning
    // (last-bin-inclusive + all-same-value guard), the count axis 0-baseline + niceMax, per-bin
    // rects (gap=0, 8px nonzero sliver floor, zero-count→0), NEUTRAL stat markers (median/mean/p95,
    // ≤3, suppressed in bins-only mode) + author markerLines, every-k x-ticks, and label
    // fit-or-hide. Anthropic's loose schema may omit any optional — all derived/defaulted;
    // `histogram` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "distribution of one metric"}>
        {/* PL-0.8: bind viz to the Panel box, full-bleed (the scatter/candlestick pattern) — the chart
            is row-aware and measures the TRUE row aspect. The old aspect-[25/16] inner box pinned the
            measured aspect to exactly VIEW_W/VIEW_H, so the row-aware viewH could never leave 640 and
            short square rows letterboxed the chart at a fraction of the row width. */}
        <div className="absolute inset-0">
          <HistogramChart
            values={viz.values}
            bins={viz.bins}
            binCount={viz.binCount}
            xLabel={viz.xLabel}
            yLabel={viz.yLabel}
            xUnit={viz.xUnit}
            markers={viz.markers ?? "off"}
            markerLines={viz.markerLines}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            valueLabels={viz.valueLabels ?? "auto"}
            accent={viz.accent}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  if (viz.kind === "funnel") {
    // PL-3.3: a multi-stage process where an ABSOLUTE quantity DROPS OFF stage to stage. planFunnel
    // (inside Funnel) owns all defensive clamps: ≤5 stages with even-stride downsample keeping
    // first+last, maxValue derivation + ≤0 guard, the C5 MIN_BAND_W floor, the C6 monotonic
    // painted-width clamp (true value preserved for count-up + drop-off %), drop-off computation from
    // TRUE values (value=0 guard), stage/value/drop label fit-or-hide, and the continuous-edge top→down
    // build. The <2-stage state is a caption-only Panel (no "no data" text). Anthropic's loose schema
    // may omit any optional — all derived/defaulted; `funnel` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "stage-to-stage drop-off"}>
        {/* PL-0.8: bind viz to the Panel box (Donut/divergence pattern) so dense chrome can't grow the row past the frame. */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Fix 3: funnel-specific aspect-[500/357] (=1000/714 ≈ 1.4:1) matches the Panel content box so the
              naturally-TALL funnel fills it with ~zero letterbox (vs the shared 25/16 that letterboxed it). */}
          <div className="aspect-[500/357] h-full max-h-full max-w-full">
            <Funnel
              stages={(viz.stages ?? []).map((s) => ({
                label: s.label,
                value: s.value,
                valueText: s.valueText,
                accent: s.accent,
              }))}
              mode={viz.mode ?? "funnel"}
              unit={viz.unit}
              dropLabels={viz.dropLabels ?? "auto"}
              accent={viz.accent ?? "cyan"}
              caption={viz.caption}
              t={t}
            />
          </div>
        </div>
      </Panel>
    );
  }
  if (viz.kind === "candlestick") {
    // PL-2.5: an OPEN/HIGH/LOW/CLOSE (OHLC) range over an ORDERED time axis. planCandles (inside
    // Candlestick) owns all defensive clamps: ≤14 candles with even-stride downsample keeping
    // first+last + invalid-candle drop (surfaced), C6 inverted-candle sanitation (lo'/hi'+clamp;
    // direction from the ORIGINAL o/c) so a broken shape is impossible, the NON-0-anchored price-axis
    // derivation ([min(low),max(high)]+8% pad) + max>min guard, the scaleBand (paddingInner reduced
    // before any body-width floor breach) + inverted scaleLinear, the C-DOJI 6px body floor (never
    // hidden), and the time-label fit-or-hide + every-k stride. Anthropic's loose schema may omit any
    // optional — all derived/defaulted; `candlestick` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "OHLC range over time"}>
        {/* PL-0.8 §3 binding: bind viz to the Panel box. Candlestick is ROW-AWARE (measures this box's
            aspect → sets its viewBox height), so NO aspect wrapper — it fills the full row width,
            keeping candle bodies ≥ the mobile floor even in a wide-short row, with no overflow. */}
        <div className="absolute inset-0">
          <Candlestick
            candles={(viz.candles ?? []).map((c) => ({ label: c.label, open: c.open, high: c.high, low: c.low, close: c.close }))}
            mode={viz.mode ?? "candles"}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            upAccent={viz.upAccent}
            downAccent={viz.downAccent}
            unit={viz.unit}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  if (viz.kind === "distribution") {
    // PL-3.5: the FIVE-NUMBER summary (min·q1·median·q3·max) + outliers of one or a few GROUPS on a
    // shared value axis. planDistribution (inside Distribution) owns all defensive clamps: the raw-
    // values-OR-precomputed resolution (values win; <4 raw → tiny-n range+median glyph; precomputed →
    // C6 sanitation so a broken box is impossible), the §3 DYNAMIC render cap on the rendered viewH
    // (even-stride downsample keeping first+last — a short row shows fewer rows, each ≥ MIN_ROW_PITCH
    // apart), the NON-0-anchored value-axis derivation ([min(all),max(all)]+8% pad) + max>min guard,
    // the scalePoint rows + scaleLinear value, the C-ZIQR 6px zero-IQR floor (never hidden), the
    // outlier cap 8 + downsample, mean suppression (no honest mean → forced off), and the row-label
    // fit-or-hide. Anthropic's loose schema may omit any optional — all derived/defaulted;
    // `distribution` is deferred from Anthropic.
    return (
      <Panel label={viz.caption ?? "distribution of a metric by group"}>
        {/* PL-0.8 §2.10/§3 binding: bind viz to the Panel box. Distribution is ROW-AWARE (measures this
            box's aspect → sets its viewBox height), so NO aspect wrapper — it fills the full row width,
            keeping outlier dots ≥ the mobile floor even in a wide-short row, with no overflow. */}
        <div className="absolute inset-0">
          <Distribution
            groups={(viz.groups ?? []).map((g) => ({
              label: g.label,
              values: g.values,
              min: g.min,
              q1: g.q1,
              median: g.median,
              q3: g.q3,
              max: g.max,
              mean: g.mean,
              outliers: g.outliers,
            }))}
            mode={viz.mode ?? "box"}
            axisMin={viz.axisMin}
            axisMax={viz.axisMax}
            showMean={viz.showMean ?? "off"}
            accent={viz.accent}
            groupAccents={viz.groupAccents}
            unit={viz.unit}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  if (viz.kind === "taxonomy") {
    // PL-3.4: a grouped HIERARCHY (N categories each with named children) drawn as a tidy node-link
    // TREE — the LINKS carry the belongs-to structure (vs tiers' co-located ranked buckets). planTaxonomy
    // (inside Taxonomy) owns all defensive clamps: depth-2 enforcement (drop leaf children), the category
    // cap 4 + per-category children cap 6 + DYNAMIC total-leaf cap on the rendered viewH (even-stride
    // keep-first-last, surfaced), the per-rank chip-width clamp (no node overlap), the §3 row-aware ranks
    // (RANK_GAP_Y reserving NODE_H/2 + the wrap band so leaf chips never overflow the bottom at any
    // viewH), the leaf-band record (child-within-parent), label fit-or-hide, and the value-chip resolve.
    // Anthropic's loose schema may omit any optional — all derived/defaulted; `taxonomy` is deferred.
    return (
      <Panel label={viz.caption ?? "a grouped hierarchy"}>
        {/* PL-0.8 §2.10/§3 binding: bind viz to the Panel box. Taxonomy is ROW-AWARE (measures this box's
            aspect → sets its viewBox height), so NO aspect wrapper — it fills the full row width, keeping
            the thin links ≥ the hairline floor; in a short box it floors at MIN_VIEW_H 336 + letterboxes. */}
        <div className="absolute inset-0">
          <Taxonomy
            categories={(viz.categories ?? []).map((c) => ({
              label: c.label,
              accent: c.accent,
              children: (c.children ?? []).map((l) => ({ label: l.label, value: l.value })),
            }))}
            rootLabel={viz.rootLabel}
            mode={viz.mode ?? "curve"}
            showValues={viz.showValues ?? "off"}
            unit={viz.unit}
            caption={viz.caption}
            t={t}
          />
        </div>
      </Panel>
    );
  }
  // stat — a single hero number (PL-1.2: count-up + entrance pop + optional proportion
  // ring, all inside StatHero; per-element reveals supersede the old block-level fade).
  return (
    // B2: hug-and-center. FitZone (h-full) fills the now-tall viz row (B1); the Panel inside sizes to its
    // content and centers with balanced margins instead of ballooning; FitZone shrinks it only if it
    // overflows a short frame (square StatHero). Byte-neutral at zoom 1 when the content already fits.
    <FitZone align="center">
      <Panel label={viz.caption ?? "the math"}>
        <StatHero big={viz.big} sub={viz.sub} note={viz.note} proportion={viz.proportion} t={t} />
      </Panel>
    </FitZone>
  );
}

export default function PostRenderer({ post, t = 1 }: { post: RenderPost; t?: number }) {
  const metrics = post.metrics?.slice(0, 4) ?? [];
  return (
    <PostFrame
      format={post.format}
      eyebrow={post.eyebrow}
      headline={post.headline}
      visualization={<Viz viz={post.visualization} t={t} />}
      summary={
        <div className="flex h-full w-full min-w-0 flex-col justify-center gap-2 min-h-0" style={{ opacity: appear(t, 0.6) }}>
          {metrics.length > 0 && (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
              {metrics.map((m, i) => (
                <MetricCard key={i} label={m.label} value={m.value} delta={m.delta} accent={m.accent ?? "cyan"} deltaTrend={m.deltaTrend} t={t} index={i} />
              ))}
            </div>
          )}
          {post.takeaway && (
            <div className="line-clamp-2 text-text-secondary" style={{ fontSize: 22, lineHeight: 1.25 }}>
              {post.takeaway}
            </div>
          )}
        </div>
      }
    />
  );
}
