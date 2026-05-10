import { addDays, parseISO, format } from 'date-fns'
import type { PendingDose } from '../../hooks/useDosePreview'

const QUICK_DOSES = [2.5, 5, 7.5, 10, 12.5, 15]

interface Props {
  value: PendingDose;
  onChange: (next: PendingDose) => void;
  onNext: () => void;
  onCancel: () => void;
}

export function DoseEntryForm({ value, onChange, onNext, onCancel }: Props) {
  const amountValid = Number.isFinite(value.amountMg) && value.amountMg > 0
  const dateValid = !!value.date
  const timeValid = !!value.time
  const canProceed = amountValid && dateValid && timeValid

  function shiftDate(days: number) {
    const next = format(addDays(parseISO(value.date), days), 'yyyy-MM-dd')
    onChange({ ...value, date: next })
  }

  function handleAmountChange(raw: string) {
    if (raw === '') {
      onChange({ ...value, amountMg: 0 })
      return
    }
    const n = parseFloat(raw)
    onChange({ ...value, amountMg: Number.isFinite(n) ? n : 0 })
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Log a Dose</h3>
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full hover:bg-surface-alt flex items-center justify-center"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Dose amount */}
      <div className="mb-5">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Dose Amount
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <input
            type="text"
            inputMode="decimal"
            value={value.amountMg === 0 ? '' : String(value.amountMg)}
            onChange={e => handleAmountChange(e.target.value)}
            placeholder="0"
            className="flex-1 min-h-14 px-4 text-3xl font-mono font-semibold tabular-nums bg-surface-alt border border-border rounded-xl outline-none focus:border-primary-400 text-text"
          />
          <span className="text-base text-text-secondary">mg</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_DOSES.map(mg => {
            const selected = Math.abs(value.amountMg - mg) < 1e-6
            return (
              <button
                key={mg}
                onClick={() => onChange({ ...value, amountMg: mg })}
                className={`min-h-11 px-4 rounded-full border text-sm font-medium tabular-nums transition-colors ${
                  selected
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-border text-text-secondary hover:bg-surface-alt'
                }`}
              >
                {mg}mg
              </button>
            )
          })}
        </div>
      </div>

      {/* Date */}
      <div className="mb-5">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Date
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftDate(-1)}
            className="w-11 h-11 rounded-lg border border-border text-lg font-semibold hover:bg-surface-alt"
            aria-label="Previous day"
          >
            −
          </button>
          <input
            type="date"
            value={value.date}
            onChange={e => onChange({ ...value, date: e.target.value })}
            className="flex-1 min-h-11 px-3 font-mono text-sm bg-surface-alt border border-border rounded-lg outline-none focus:border-primary-400 text-text"
          />
          <button
            onClick={() => shiftDate(1)}
            className="w-11 h-11 rounded-lg border border-border text-lg font-semibold hover:bg-surface-alt"
            aria-label="Next day"
          >
            +
          </button>
        </div>
      </div>

      {/* Time */}
      <div className="mb-6">
        <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
          Time
        </div>
        <input
          type="time"
          value={value.time}
          onChange={e => onChange({ ...value, time: e.target.value })}
          className="w-full min-h-11 px-3 font-mono text-sm bg-surface-alt border border-border rounded-lg outline-none focus:border-primary-400 text-text"
        />
      </div>

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base active:bg-primary-700 disabled:opacity-40 disabled:active:bg-primary-600"
      >
        Next: Preview
      </button>
    </div>
  )
}
