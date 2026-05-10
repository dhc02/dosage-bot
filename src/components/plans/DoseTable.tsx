import { useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { formatDate } from '../../lib/date-utils'
import { resolveWeights } from '../../lib/pk-engine'
import { QuickSchedule } from './QuickSchedule'
import { TimeInput } from '../shared/TimeInput'
import { INJECTION_SITE_LABELS, type InjectionSite } from '../../types'
import type { Plan } from '../../types'

export function DoseTable() {
  const { getActivePatient, addDose, updateDose, removeDose, updatePlanStartingWeight } = usePatientStore()
  const { selectedPlanId, showQuickSchedule, setShowQuickSchedule } = useUIStore()
  const patientData = getActivePatient()

  const plan = patientData?.plans.find((p: Plan) => p.id === selectedPlanId)

  const showWeight = plan?.type === 'actual' || plan?.type === 'experiment'
  const sortedDoses = useMemo(
    () => plan ? [...plan.doses].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)) : [],
    [plan?.doses],
  )
  const effectiveWeights = useMemo(
    () => resolveWeights(sortedDoses, plan?.startingWeightLbs),
    [sortedDoses, plan?.startingWeightLbs],
  )

  if (!patientData || !selectedPlanId || !plan) {
    return (
      <div className="text-center py-8 text-text-secondary text-sm">
        Select a plan from the sidebar to view and edit doses
      </div>
    )
  }

  function handleAddDose() {
    const lastDose = sortedDoses[sortedDoses.length - 1]
    const nextDate = lastDose
      ? (() => {
          const d = new Date(lastDose.date)
          d.setDate(d.getDate() + 7)
          return d.toISOString().split('T')[0]
        })()
      : new Date().toISOString().split('T')[0]

    addDose(selectedPlanId!, {
      date: nextDate,
      time: lastDose?.time ?? '08:00',
      amountMg: lastDose?.amountMg ?? 2.5,
      weightLbs: showWeight ? lastDose?.weightLbs : undefined,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-text">
            Doses — <span style={{ color: plan.color }}>{plan.name}</span>
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span>Starting weight:</span>
            <input
              type="number"
              value={plan.startingWeightLbs ?? ''}
              placeholder="—"
              onChange={e => {
                const val = e.target.value ? parseFloat(e.target.value) : undefined
                updatePlanStartingWeight(plan.id, val)
              }}
              step="0.1"
              min="0"
              className="w-16 text-right font-mono text-xs bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary-400 placeholder:text-border"
            />
            <span>lbs</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowQuickSchedule(true)}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-surface-alt transition-colors"
          >
            Quick Schedule...
          </button>
          <button
            onClick={handleAddDose}
            className="text-xs px-2.5 py-1.5 rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            + Add Dose
          </button>
        </div>
      </div>

      {sortedDoses.length === 0 ? (
        <div className="text-center py-6 text-text-secondary text-sm border border-dashed border-border rounded-lg">
          No doses yet. Click "Add Dose" or "Quick Schedule" to get started.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-alt border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-text-secondary text-xs">Date</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary text-xs">Time</th>
                <th className="text-right px-3 py-2 font-medium text-text-secondary text-xs">Dose (mg)</th>
                {showWeight && (
                  <th className="text-right px-3 py-2 font-medium text-text-secondary text-xs">Weight (lbs)</th>
                )}
                <th className="text-left px-3 py-2 font-medium text-text-secondary text-xs">Site</th>
                <th className="text-left px-3 py-2 font-medium text-text-secondary text-xs">Note</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {sortedDoses.map((dose, i) => (
                <tr key={dose.id} className={`border-b border-border last:border-b-0 hover:bg-surface-alt/50 ${i % 2 === 0 ? '' : 'bg-surface-alt/30'}`}>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={dose.date}
                      onChange={e => updateDose(plan.id, dose.id, { date: e.target.value })}
                      className="font-mono text-sm bg-transparent border-0 outline-none cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <TimeInput
                      value={dose.time}
                      onChange={time => updateDose(plan.id, dose.id, { time })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      value={dose.amountMg}
                      onChange={e => updateDose(plan.id, dose.id, { amountMg: parseFloat(e.target.value) || 0 })}
                      step="0.5"
                      min="0"
                      className="w-20 text-right font-mono text-sm bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary-400"
                    />
                  </td>
                  {showWeight && (
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        value={dose.weightLbs ?? ''}
                        placeholder={effectiveWeights[i] != null ? String(effectiveWeights[i]) : '—'}
                        onChange={e => {
                          const val = e.target.value ? parseFloat(e.target.value) : undefined
                          updateDose(plan.id, dose.id, { weightLbs: val || undefined })
                        }}
                        step="0.1"
                        min="0"
                        className="w-20 text-right font-mono text-sm bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary-400 placeholder:text-border"
                      />
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <select
                      value={dose.injectionSite ?? ''}
                      onChange={e => {
                        const val = e.target.value as InjectionSite | ''
                        updateDose(plan.id, dose.id, { injectionSite: val || undefined })
                      }}
                      className="w-16 text-xs font-mono bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:border-primary-400 text-text-secondary"
                    >
                      <option value="">—</option>
                      <option value="belly">{INJECTION_SITE_LABELS.belly}</option>
                      <option value="thigh">{INJECTION_SITE_LABELS.thigh}</option>
                      <option value="arm">{INJECTION_SITE_LABELS.arm}</option>
                      <option value="other">{INJECTION_SITE_LABELS.other}</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={dose.note ?? ''}
                      placeholder="—"
                      onChange={e => updateDose(plan.id, dose.id, { note: e.target.value || undefined })}
                      className="w-full text-sm bg-transparent border-0 outline-none text-text-secondary placeholder:text-border"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => removeDose(plan.id, dose.id)}
                      className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-500"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 text-xs text-text-secondary font-mono">
        {sortedDoses.length} injection{sortedDoses.length !== 1 ? 's' : ''} · {sortedDoses.reduce((s, d) => s + d.amountMg, 0).toFixed(1)}mg total
        {sortedDoses.length >= 2 && (
          <> · {formatDate(sortedDoses[0].date)} to {formatDate(sortedDoses[sortedDoses.length - 1].date)}</>
        )}
      </div>

      {showQuickSchedule && <QuickSchedule planId={plan.id} />}
    </div>
  )
}
