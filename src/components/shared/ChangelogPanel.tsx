import { useState, useEffect, useCallback } from 'react'
import { usePatientStore } from '../../store/patient-store'
import * as api from '../../lib/api'
import type { ChangelogEntry } from '../../lib/api'

function formatChange(change: ChangelogEntry['changes'][0]): string {
  switch (change.type) {
    case 'dose_added':
      return `Added dose: ${change.doseDescription} to "${change.planName}"`
    case 'dose_removed':
      return `Removed dose: ${change.doseDescription} from "${change.planName}"`
    case 'dose_modified': {
      const fields = change.fields
        ? Object.entries(change.fields)
            .map(([key, val]) => {
              const label = key === 'amountMg' ? 'amount' :
                key === 'injectionSite' ? 'site' :
                key === 'weightLbs' ? 'weight' : key
              return `${label}: ${formatVal(val.old)} → ${formatVal(val.new)}`
            })
            .join(', ')
        : ''
      return `Changed dose ${change.doseDescription} in "${change.planName}" (${fields})`
    }
    case 'plan_added':
      return `Added plan "${change.planName}" (${change.planType})`
    case 'plan_removed':
      return `Removed plan "${change.planName}" (${change.planType})`
    case 'plan_renamed':
      return `Renamed plan from "${change.fields?.name?.old}" to "${change.fields?.name?.new}"`
    case 'params_changed': {
      const fields = change.fields
        ? Object.entries(change.fields)
            .map(([key, val]) => `${key}: ${formatVal(val.old)} → ${formatVal(val.new)}`)
            .join(', ')
        : ''
      return `Updated PK params for "${change.planName}" (${fields})`
    }
    case 'active_plan_changed':
      return `Switched ${change.planType} plan`
    case 'starting_weight_changed':
      return `Changed starting weight in "${change.planName}": ${formatVal(change.fields?.startingWeightLbs?.old)} → ${formatVal(change.fields?.startingWeightLbs?.new)} lbs`
    case 'patient_renamed':
      return `Renamed patient from "${change.fields?.name?.old}" to "${change.fields?.name?.new}"`
    default:
      return change.type
  }
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(empty)'
  return String(v)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString()
}

export function ChangelogPanel({ onClose }: { onClose: () => void }) {
  const activePatient = usePatientStore(s => s.getActivePatient())
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activePatient) return
    setLoading(true)
    api.fetchChangelog(activePatient.patient.id)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [activePatient])

  const handleRestore = useCallback(async (timestamp: string) => {
    if (!activePatient) return
    if (!confirm('Restore to this state? This will undo all changes after this point.')) return
    try {
      await api.restorePatientState(activePatient.patient.id, timestamp)
      const reloaded = await api.fetchPatientData(activePatient.patient.id)
      usePatientStore.setState(state => ({
        patients: state.patients.map(p =>
          p.patient.id === activePatient.patient.id ? reloaded : p
        ),
        undoStack: [],
        redoStack: [],
      }))
      onClose()
    } catch (err) {
      alert('Restore failed: ' + err)
    }
  }, [activePatient, onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-96 h-full bg-surface border-l border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Change History</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-text-secondary"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-sm text-text-secondary">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-text-secondary">No changes recorded yet.</p>
          ) : (
            [...entries].reverse().map((entry, i) => (
              <div key={i} className="text-xs border border-border rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">{formatTime(entry.timestamp)}</span>
                  <button
                    onClick={() => handleRestore(entry.timestamp)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-text-secondary hover:text-text hover:bg-border transition-colors"
                    title="Restore to this point (undo all later changes)"
                  >
                    restore
                  </button>
                </div>
                {entry.changes.map((change, j) => (
                  <div key={j} className="text-text leading-relaxed">
                    • {formatChange(change)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border text-[10px] text-text-secondary">
          Last {entries.length} changes kept • Click "restore" to roll back to that point
        </div>
      </div>
    </div>
  )
}
