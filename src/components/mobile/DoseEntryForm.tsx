import { useState, useEffect, useRef } from 'react'
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
  // Track raw input string to avoid stripping trailing decimals while typing
  const [rawAmount, setRawAmount] = useState(value.amountMg === 0 ? '' : String(value.amountMg))
  const syncedRef = useRef(value.amountMg)

  // Sync rawAmount when external value changes (e.g. quick-select tap, +/- button)
  // but not when it's us who triggered the change
  useEffect(() => {
    if (value.amountMg !== syncedRef.current) {
      syncedRef.current = value.amountMg
      setRawAmount(value.amountMg === 0 ? '' : String(value.amountMg))
    }
  }, [value.amountMg])

  const parsedAmount = parseFloat(rawAmount)
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0
  const dateValid = !!value.date
  const timeValid = !!value.time
  const canProceed = amountValid && dateValid && timeValid

  function shiftDate(days: number) {
    const next = format(addDays(parseISO(value.date), days), 'yyyy-MM-dd')
    onChange({ ...value, date: next })
  }

  function setAmount(mg: number) {
    syncedRef.current = mg
    setRawAmount(String(mg))
    onChange({ ...value, amountMg: mg })
  }

  function handleAmountInput(raw: string) {
    // Allow: empty, digits, one decimal point, up to 2 decimal places
    if (raw !== '' && !/^\d*\.?\d{0,2}$/.test(raw)) return
    setRawAmount(raw)
    const n = parseFloat(raw)
    if (Number.isFinite(n)) {
      syncedRef.current = n
      onChange({ ...value, amountMg: n })
    }
  }

  function adjustAmount(delta: number) {
    const current = Number.isFinite(parsedAmount) ? parsedAmount : 0
    const next = Math.max(0, Math.round((current + delta) * 100) / 100)
    setAmount(next)
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
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => adjustAmount(-0.3)}
            className="w-11 h-11 rounded-lg border border-border text-lg font-semibold hover:bg-surface-alt shrink-0"
            aria-label="Decrease by 0.3mg"
          >
            −
          </button>
          <div className="flex items-baseline gap-1 flex-1">
            <input
              type="text"
              inputMode="decimal"
              value={rawAmount}
              onChange={e => handleAmountInput(e.target.value)}
              placeholder="0"
              className="w-full min-h-14 px-3 text-3xl font-mono font-semibold tabular-nums bg-surface-alt border border-border rounded-xl outline-none focus:border-primary-400 text-text text-center"
            />
            <span className="text-base text-text-secondary shrink-0">mg</span>
          </div>
          <button
            onClick={() => adjustAmount(0.3)}
            className="w-11 h-11 rounded-lg border border-border text-lg font-semibold hover:bg-surface-alt shrink-0"
            aria-label="Increase by 0.3mg"
          >
            +
          </button>
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
