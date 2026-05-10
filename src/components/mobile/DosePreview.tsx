import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import type { DosePreviewResult, PendingDose } from '../../hooks/useDosePreview'

interface Props {
  pending: PendingDose;
  preview: DosePreviewResult;
  onBack: () => void;
  onConfirm: () => void;
  saving?: boolean;
}

function classifySlope(perDay: number): 'up' | 'down' | 'steady' {
  if (perDay > 0.1) return 'up'
  if (perDay < -0.1) return 'down'
  return 'steady'
}

const SLOPE_CONFIG = {
  up: { arrow: '↑', label: 'Rising', color: 'text-emerald-600' },
  down: { arrow: '↓', label: 'Falling', color: 'text-red-500' },
  steady: { arrow: '↔', label: 'Steady', color: 'text-text-secondary' },
} as const

export function DosePreview({ pending, preview, onBack, onConfirm, saving }: Props) {
  const beforePerDay = preview.slopeBeforePerHour * 24
  const afterPerDay = preview.slopeAfterPerHour * 24
  const beforeSlope = SLOPE_CONFIG[classifySlope(beforePerDay)]
  const afterSlope = SLOPE_CONFIG[classifySlope(afterPerDay)]

  const chartData = preview.curve.map(p => ({
    timestamp: p.timestamp,
    existing: p.baseline > 1e-6 ? Number(p.baseline.toFixed(3)) : null,
    withDose: p.withDose > 1e-6 ? Number(p.withDose.toFixed(3)) : null,
  }))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Preview Effects</h3>
        <button
          onClick={onBack}
          className="text-sm text-primary-600 font-medium px-2 min-h-9 hover:bg-surface-alt rounded-lg"
        >
          ← Back
        </button>
      </div>

      <div className="bg-surface-alt border border-border rounded-xl p-3 mb-4">
        <div className="text-xs text-text-secondary mb-0.5">Adding</div>
        <div className="font-mono text-base font-semibold tabular-nums">
          {pending.amountMg}mg
          <span className="text-text-secondary font-normal text-sm ml-2">
            on {format(new Date(preview.doseTimestampMs), 'MMM d, yyyy')} at {pending.time}
          </span>
        </div>
      </div>

      {/* Before / After */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PreviewBlock
          label="Before"
          concentration={preview.concentrationBefore}
          slopePerDay={beforePerDay}
          slopeCfg={beforeSlope}
        />
        <PreviewBlock
          label="After (+24h)"
          concentration={preview.concentrationAfter24h}
          slopePerDay={afterPerDay}
          slopeCfg={afterSlope}
          highlight
        />
      </div>

      {/* Peak callout */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
              Projected Peak
            </div>
            <div className="font-mono text-base font-semibold tabular-nums text-text mt-0.5">
              {preview.peakAfter.toFixed(1)} <span className="text-xs text-text-secondary font-normal">ng/mL</span>
            </div>
          </div>
          <div className="text-xs text-text-secondary text-right">
            within<br />14 days
          </div>
        </div>
      </div>

      {/* Mini chart */}
      <div className="bg-surface border border-border rounded-xl p-2 mb-5">
        <div className="text-xs uppercase tracking-wider text-text-secondary font-medium px-2 pt-1 pb-2">
          Curve Comparison
        </div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts: number) => format(new Date(ts), 'MMM d')}
                tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                stroke="var(--color-border)"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                stroke="var(--color-border)"
                width={32}
              />
              <Tooltip
                content={<MiniTooltip />}
                cursor={{ stroke: 'var(--color-border)' }}
              />
              <ReferenceLine
                x={preview.doseTimestampMs}
                stroke="var(--color-primary-500)"
                strokeDasharray="3 3"
                label={{ value: 'dose', position: 'top', fontSize: 10, fill: 'var(--color-primary-600)' }}
              />
              <Line
                type="monotone"
                dataKey="existing"
                stroke="var(--color-actual)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Existing"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="withDose"
                stroke="var(--color-primary-600)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
                name="With new dose"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 px-2 pb-1 text-[10px] text-text-secondary">
          <LegendSwatch color="var(--color-actual)" label="Existing" />
          <LegendSwatch color="var(--color-primary-600)" label="With new dose" dashed />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 min-h-14 rounded-2xl border border-border text-text font-semibold text-base hover:bg-surface-alt disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex-[2] min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base active:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Confirm & Save'}
        </button>
      </div>
    </div>
  )
}

function PreviewBlock({
  label,
  concentration,
  slopePerDay,
  slopeCfg,
  highlight,
}: {
  label: string;
  concentration: number;
  slopePerDay: number;
  slopeCfg: typeof SLOPE_CONFIG[keyof typeof SLOPE_CONFIG];
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 border ${highlight ? 'bg-primary-50 border-primary-200' : 'bg-surface border-border'}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
        {concentration.toFixed(1)}
        <span className="text-xs text-text-secondary font-normal ml-1">ng/mL</span>
      </div>
      <div className={`mt-1 text-xs font-medium flex items-center gap-1 ${slopeCfg.color}`}>
        <span className="text-sm">{slopeCfg.arrow}</span>
        <span>{slopeCfg.label}</span>
        <span className="font-mono tabular-nums text-text-secondary ml-auto">
          {slopePerDay >= 0 ? '+' : ''}{slopePerDay.toFixed(2)}/d
        </span>
      </div>
    </div>
  )
}

function MiniTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
}) {
  if (!active || !payload || payload.length === 0 || label == null) return null
  return (
    <div className="bg-surface border border-border rounded-lg shadow-md p-2 text-[11px]">
      <div className="font-medium text-text mb-1">{format(new Date(label), 'MMM d HH:mm')}</div>
      {payload.map(entry => (
        <div key={entry.name} className="flex items-center gap-1.5" style={{ color: entry.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="font-mono font-semibold text-text tabular-nums">{entry.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

function LegendSwatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-4 h-0.5"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
      <span>{label}</span>
    </span>
  )
}
