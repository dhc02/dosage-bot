import { useState } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { concentrationAtTime, slopeAtTime, doseTimestamp, findNextPeakTime, findPreviousPeakTime } from '../../lib/pk-engine'
import { MENTAL_STATES, type MentalState } from '../../types'

export function ExperienceLogForm() {
  const { showExperienceLogForm, setShowExperienceLogForm } = useUIStore()
  const { getActivePlan, addExperienceLog } = usePatientStore()

  const [mentalState, setMentalState] = useState<MentalState>('normal')
  const [hunger, setHunger] = useState(5)
  const [energy, setEnergy] = useState(5)
  const [notes, setNotes] = useState('')

  if (!showExperienceLogForm) return null

  function handleSubmit() {
    const ts = Date.now()
    const actual = getActivePlan('actual')

    let serum: number | undefined
    let slopePerHour: number | undefined
    let hoursSinceLast: number | undefined
    let hoursUntilPeak: number | undefined
    let hoursSincePeak: number | undefined

    if (actual && actual.doses.length > 0) {
      serum = concentrationAtTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)
      slopePerHour = slopeAtTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)

      const lastDoseTs = Math.max(...actual.doses.map(doseTimestamp).filter(t => t <= ts))
      if (Number.isFinite(lastDoseTs)) {
        hoursSinceLast = (ts - lastDoseTs) / (1000 * 3600)
      }

      if (slopePerHour > 0) {
        const peakMs = findNextPeakTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)
        if (peakMs != null) hoursUntilPeak = (peakMs - ts) / (1000 * 3600)
      } else if (slopePerHour < 0) {
        const peakMs = findPreviousPeakTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)
        if (peakMs != null) hoursSincePeak = (ts - peakMs) / (1000 * 3600)
      }
    }

    addExperienceLog({
      timestamp: ts,
      mentalState,
      hungerLevel: hunger,
      energyLevel: energy,
      notes: notes.trim() || undefined,
      serumConcentration: serum,
      slopeNgPerMlPerHour: slopePerHour,
      hoursSinceLastDose: hoursSinceLast,
      hoursUntilPeak,
      hoursSincePeak,
    })

    // Reset & close
    setMentalState('normal')
    setHunger(5)
    setEnergy(5)
    setNotes('')
    setShowExperienceLogForm(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40" onClick={() => setShowExperienceLogForm(false)}>
      <div
        className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">How are you feeling?</h3>
          <button
            onClick={() => setShowExperienceLogForm(false)}
            className="w-9 h-9 rounded-full hover:bg-surface-alt flex items-center justify-center"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mental state chips */}
        <div className="mb-4">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Mental State</div>
          <div className="flex flex-wrap gap-2">
            {MENTAL_STATES.map(s => (
              <button
                key={s}
                onClick={() => setMentalState(s)}
                className={`min-h-11 px-4 rounded-full border text-sm capitalize transition-colors ${
                  mentalState === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-border text-text-secondary hover:bg-surface-alt'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Hunger slider */}
        <ScaleSlider label="Hunger" value={hunger} onChange={setHunger} />

        {/* Energy slider */}
        <ScaleSlider label="Energy" value={energy} onChange={setEnergy} />

        {/* Notes */}
        <label className="block mb-5">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything else you want to remember about right now?"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary-400 resize-none"
          />
        </label>

        <button
          onClick={handleSubmit}
          className="w-full min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base active:bg-primary-700"
        >
          Save Log
        </button>
      </div>
    </div>
  )
}

function ScaleSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</span>
        <span className="font-mono font-semibold text-base tabular-nums">{value}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-primary-600 h-3"
      />
      <div className="flex justify-between text-[10px] text-text-secondary mt-1">
        <span>1</span><span>5</span><span>10</span>
      </div>
    </div>
  )
}
