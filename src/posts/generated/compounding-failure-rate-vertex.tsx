
import { CreatorSignature } from "@/components/primitives/CreatorSignature";
import { Panel } from "@/components/primitives/Panel";
import { revealStyle, appear, rise } from "@/lib/reveal";
import { colors, fonts, layout } from "@/tokens/design";
import { interpolate } from "remotion";

// Re-implementing PostFrame structure to fix layout issue
// as PostFrame component seems to have a bug with text overflow.

const AnimatedNumber = ({ t, from = 1.0, to = 0.60 }: { t: number, from?: number, to?: number }) => {
  const num = interpolate(t, [0, 1], [from, to]);
  const displayValue = num.toFixed(2);
  return <span>{displayValue}</span>;
}

const Summary = ({t}: {t: number}) => {
  return (
    <div style={{...revealStyle(t, 0.85), fontSize: 38, fontFamily: fonts.body}}>
      <p>Reliable systems use <span style={{color: colors.accent.amber}}>fewer, verified steps</span>—not just better models.</p>
    </div>
  )
}

export default function Post({ t = 1 }: { t?: number }) {

  const eqOpacity = appear(t, 0.25);
  const eqRise = rise(t, 0.25);
  
  const resultT = Math.max(0, Math.min(1, (t - 0.5) / 0.3));
  const barWidth = interpolate(t, [0.5, 0.8], [100, 60], { extrapolateRight: 'clamp' });

  const exponentStyle: React.CSSProperties = {
    color: colors.text.secondary,
    fontSize: 70,
    ...revealStyle(t, 0.35)
  };
  exponentStyle.transform = `${(exponentStyle.transform || '')} translateY(-40px)`;

  return (
    <div
      className="relative grid h-full w-full overflow-hidden bg-bg-warm-graphite bg-grid-faint bg-grid text-text-primary"
      style={{
        aspectRatio: `1080 / 1350`,
        gridTemplateRows: `${layout.headlineRatio}fr ${layout.vizRatio}fr ${layout.summaryRatio}fr`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-warm-vignette" />

      <header style={{...revealStyle(t, 0.0)}} className="relative flex flex-col justify-end gap-5 px-20 pb-8 pt-16">
          <span
            className="font-mono uppercase tracking-[0.24em] text-accent-amber"
            style={{ fontSize: 26 }}
          >
            COMPOUNDING FAILURE RATE
          </span>
        <h1
          className="font-display font-semibold tracking-tight text-text-primary"
          style={{ fontSize: 68, lineHeight: 1.05 }}
        >
          Why AI Agents Fail in Production
        </h1>
      </header>

      <main className="relative flex flex-col px-16 [&>*]:flex-1">
        <div className="flex flex-col items-center justify-center w-full h-full">
          <Panel
            label="System Reliability Formula"
            style={{ ...revealStyle(t, 0.25, 0.5), width: '80%'}}
            className="flex items-center justify-center p-12"
          >
            <div
              className="flex items-center justify-center text-8xl font-semibold"
              style={{
                fontSize: 140,
                fontFamily: fonts.display,
                color: colors.text.primary,
                opacity: eqOpacity,
                transform: `translateY(${eqRise}px)`
              }}
            >
              <span style={{ color: colors.accent.cyan, ...revealStyle(t, 0.3) }}>0.95</span>
              <span style={exponentStyle}>10</span>
              <span style={{ color: colors.text.tertiary, margin: '0 24px', ...revealStyle(t, 0.4) }}>=</span>
              
              <div style={{...revealStyle(t, 0.5)}}>
                 <span style={{ color: colors.semanticAccent.frictionOrange, textShadow: `0 0 32px ${colors.semanticAccent.frictionOrange}66` }}>
                    {t < 0.5 ? '1.00' : <AnimatedNumber t={resultT} to={0.60} />}
                 </span>
              </div>
            </div>
          </Panel>

          {/* Explanatory text & Visual Bar */}
          <div className="w-[80%] mt-8 flex flex-col items-center" style={{ ...revealStyle(t, 0.65) }}>
             {/* Visual Bar */}
             <div className="w-full h-10 bg-warm-graphite rounded-lg border border-white/10 overflow-hidden">
                <div 
                  className="h-full rounded-lg transition-width duration-300 ease-out"
                  style={{
                    width: `${barWidth}%`, 
                    backgroundColor: colors.accent.cyan,
                    boxShadow: `0 0 16px ${colors.accent.cyan}44`,
                  }}/>
             </div>
             <p className="mt-4 text-center" style={{ fontSize: 28, color: colors.text.secondary, fontFamily: fonts.body }}>
              At 95% per-step reliability, a 10-step process is only <span style={{color: colors.semanticAccent.frictionOrange, fontWeight: '600'}}>60%</span> reliable.
             </p>
          </div>
        </div>
      </main>
      
      <footer className="relative flex flex-col gap-3 border-t border-white/[0.06] px-16 pt-5 pb-4">
        <div className="flex flex-1 items-center justify-between gap-8 min-h-0">
            <Summary t={t} />
        </div>
        <div className="flex justify-end">
          <CreatorSignature entranceProgress={appear(t, 0.1)} />
        </div>
      </footer>

    </div>
  );
}
