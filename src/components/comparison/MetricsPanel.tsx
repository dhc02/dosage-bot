import type { ComputedPlan } from '../../types'

interface Props {
  baseline: ComputedPlan | null;
  experiment: ComputedPlan | null;
  actual: ComputedPlan | null;
}

interface MetricDef {
  label: string;
  key: keyof ComputedPlan['metrics'];
  format: (v: number) => string;
  unit: string;
  lowerIsBetter?: boolean;
}

const METRICS: MetricDef[] = [
  { label: 'Peak', key: 'peakConcentration', format: v => v.toFixed(1), unit: 'ng/mL' },
  { label: 'Trough', key: 'troughConcentration', format: v => v.toFixed(1), unit: 'ng/mL' },
  { label: 'Average', key: 'averageConcentration', format: v => v.toFixed(1), unit: 'ng/mL' },
  { label: 'P/T Ratio', key: 'peakTroughRatio', format: v => v.toFixed(2), unit: '', lowerIsBetter: true },
  { label: 'Above 30% Peak', key: 'timeInEffectiveZonePct', format: v => v.toFixed(0), unit: '%' },
  { label: 'Total Dose', key: 'totalDoseMg', format: v => v.toFixed(1), unit: 'mg' },
  { label: 'Injections', key: 'injectionCount', format: v => String(v), unit: '' },
  { label: 'mg/week', key: 'avgMgPerWeek', format: v => v.toFixed(1), unit: '' },
]

function DeltaBadge({ baseVal, expVal, lowerIsBetter }: { baseVal: number; expVal: number; lowerIsBetter?: boolean }) {
  if (!baseVal || !expVal) return null
  const diff = expVal - baseVal
  const pct = baseVal !== 0 ? (diff / baseVal) * 100 : 0
  if (Math.abs(pct) < 0.5) return null

  const isGood = lowerIsBetter ? diff < 0 : diff > 0
  const color = isGood ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'
  const arrow = diff > 0 ? '\u2191' : '\u2193'

  return (
    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      {arrow}{Math.abs(pct).toFixed(0)}%
    </span>
  )
}

export function MetricsPanel({ baseline, experiment, actual }: Props) {
  const hasComparison = baseline && experiment

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-text mb-3">Key Metrics</h3>
      <div className="grid grid-cols-4 gap-3">
        {METRICS.map(m => {
          const bVal = baseline ? baseline.metrics[m.key] as number : null
          const eVal = experiment ? experiment.metrics[m.key] as number : null
          const aVal = actual ? actual.metrics[m.key] as number : null

          return (
            <div key={m.key} className="bg-surface-alt rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-text-secondary font-medium mb-1.5">
                {m.label}
              </div>

              {bVal != null && (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-baseline shrink-0" />
                  <span className="font-mono text-sm font-semibold">{m.format(bVal)}</span>
                  {m.unit && <span className="text-[10px] text-text-secondary">{m.unit}</span>}
                </div>
              )}

              {eVal != null && (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-experiment shrink-0" />
                  <span className="font-mono text-sm font-semibold">{m.format(eVal)}</span>
                  {m.unit && <span className="text-[10px] text-text-secondary">{m.unit}</span>}
                  {hasComparison && bVal != null && (
                    <DeltaBadge baseVal={bVal} expVal={eVal} lowerIsBetter={m.lowerIsBetter} />
                  )}
                </div>
              )}

              {aVal != null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-actual shrink-0" />
                  <span className="font-mono text-sm font-semibold">{m.format(aVal)}</span>
                  {m.unit && <span className="text-[10px] text-text-secondary">{m.unit}</span>}
                </div>
              )}

              {bVal == null && eVal == null && aVal == null && (
                <div className="text-xs text-text-secondary italic">—</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
