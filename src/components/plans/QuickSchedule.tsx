import { useState, useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { generateRepeatingSchedule, generateStandardTitration } from '../../lib/standard-schedules'
import { todayStr, formatDateShort } from '../../lib/date-utils'
import { TimeInput } from '../shared/TimeInput'
import type { Dose } from '../../types'

type InsertMode = 'replace' | 'append' | 'after';

interface Props {
  planId: string;
}

export function QuickSchedule({ planId }: Props) {
  const { setDoses, updatePlanStartingWeight, getActivePatient } = usePatientStore()
  const patientData = getActivePatient()
  const currentPlan = patientData?.plans.find(p => p.id === planId)
  const { setShowQuickSchedule } = useUIStore()

  const [mode, setMode] = useState<'standard' | 'custom'>('standard')
  const [startDate, setStartDate] = useState(todayStr())
  const [doseMg, setDoseMg] = useState(2.5)
  const [intervalDays, setIntervalDays] = useState(7)
  const [count, setCount] = useState(8)
  const [defaultTime, setDefaultTime] = useState('08:00')
  const [startingWeight, setStartingWeight] = useState(currentPlan?.startingWeightLbs?.toString() ?? '')
  const [insertMode, setInsertMode] = useState<InsertMode>('replace')
  const [afterDoseId, setAfterDoseId] = useState<string>('')

  const existingDoses = useMemo(
    () => currentPlan
      ? [...currentPlan.doses].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      : [],
    [currentPlan?.doses],
  )

  // Default "after dose" to last dose
  const resolvedAfterDoseId = afterDoseId || existingDoses[existingDoses.length - 1]?.id || ''

  function handleApply() {
    let newDoses: Dose[]
    if (mode === 'standard') {
      newDoses = generateStandardTitration(new Date(startDate + 'T00:00:00'), defaultTime)
    } else {
      newDoses = generateRepeatingSchedule(new Date(startDate + 'T00:00:00'), doseMg, intervalDays, count, defaultTime)
    }

    if (insertMode === 'replace') {
      setDoses(planId, newDoses)
    } else if (insertMode === 'append') {
      setDoses(planId, [...existingDoses, ...newDoses])
    } else {
      // Insert after a specific dose
      const idx = existingDoses.findIndex(d => d.id === resolvedAfterDoseId)
      const before = existingDoses.slice(0, idx + 1)
      const after = existingDoses.slice(idx + 1)
      setDoses(planId, [...before, ...newDoses, ...after])
    }

    const weightVal = startingWeight ? parseFloat(startingWeight) : undefined
    if (weightVal) updatePlanStartingWeight(planId, weightVal)
    setShowQuickSchedule(false)
  }

  const hasExistingDoses = existingDoses.length > 0

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowQuickSchedule(false)}>
      <div className="bg-surface rounded-xl shadow-xl border border-border w-[28rem] p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-4">Quick Schedule</h3>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('standard')}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${
              mode === 'standard' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-border hover:bg-surface-alt'
            }`}
          >
            FDA Titration
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${
              mode === 'custom' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-border hover:bg-surface-alt'
            }`}
          >
            Custom Repeat
          </button>
        </div>

        <div className="space-y-3">
          {/* Insert mode */}
          {hasExistingDoses && (
            <div>
              <span className="text-xs font-medium text-text-secondary">Insert Mode</span>
              <div className="mt-1 flex gap-1.5">
                {([
                  { value: 'replace', label: 'Replace all' },
                  { value: 'append', label: 'Add to end' },
                  { value: 'after', label: 'Insert after dose' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setInsertMode(opt.value)}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                      insertMode === opt.value
                        ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                        : 'border-border hover:bg-surface-alt text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* After-dose picker */}
          {insertMode === 'after' && hasExistingDoses && (
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Insert after</span>
              <select
                value={resolvedAfterDoseId}
                onChange={e => setAfterDoseId(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400 bg-surface font-mono"
              >
                {existingDoses.map(d => (
                  <option key={d.id} value={d.id}>
                    {formatDateShort(d.date)} — {d.amountMg}mg
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-text-secondary">Time of Day</span>
            <div className="mt-1">
              <TimeInput value={defaultTime} onChange={setDefaultTime} />
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Starting Weight (lbs)</span>
            <input
              type="number"
              value={startingWeight}
              placeholder="Optional"
              onChange={e => setStartingWeight(e.target.value)}
              step="0.1"
              min="0"
              className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400 font-mono placeholder:text-text-secondary/40"
            />
          </label>

          {mode === 'standard' && (
            <p className="text-xs text-text-secondary leading-relaxed">
              2.5mg q7d (4 wk) → 5mg q7d (4 wk) → 7.5mg (4 wk) → 10mg (4 wk) → 15mg (4 wk).
            </p>
          )}

          {mode === 'custom' && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">Dose (mg)</span>
                <input
                  type="number"
                  value={doseMg}
                  onChange={e => setDoseMg(parseFloat(e.target.value) || 0)}
                  step="0.5"
                  min="0"
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">Every N days</span>
                <input
                  type="number"
                  value={intervalDays}
                  onChange={e => setIntervalDays(parseInt(e.target.value) || 1)}
                  min="1"
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">Number of doses</span>
                <input
                  type="number"
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value) || 1)}
                  min="1"
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-border rounded-md outline-none focus:border-primary-400 font-mono"
                />
              </label>
            </>
          )}

          {insertMode === 'replace' && hasExistingDoses && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-md px-2.5 py-1.5">
              This will replace all {existingDoses.length} existing dose{existingDoses.length !== 1 ? 's' : ''} in this plan.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => setShowQuickSchedule(false)}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-surface-alt"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
          >
            {insertMode === 'replace' ? 'Replace Doses' : 'Add Doses'}
          </button>
        </div>
      </div>
    </div>
  )
}
