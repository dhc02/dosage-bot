import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { useDosePreview, type PendingDose } from '../../hooks/useDosePreview'
import { DoseEntryForm } from './DoseEntryForm'
import { DosePreview } from './DosePreview'

function roundedNowTime(): string {
  const now = new Date()
  const minutes = Math.round(now.getMinutes() / 15) * 15
  now.setMinutes(minutes === 60 ? 0 : minutes, 0, 0)
  if (minutes === 60) now.setHours(now.getHours() + 1)
  return format(now, 'HH:mm')
}

function todayDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function defaultPending(): PendingDose {
  return {
    date: todayDate(),
    time: roundedNowTime(),
    amountMg: 0,
  }
}

export function DoseEntryFlow() {
  const {
    showDoseEntry,
    doseEntryStep,
    setDoseEntryStep,
    closeDoseEntry,
  } = useUIStore()
  const { getActivePlan, addPlan, addDose } = usePatientStore()

  const [pending, setPending] = useState<PendingDose>(defaultPending)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Reset state when the flow opens
  useEffect(() => {
    if (showDoseEntry) {
      setPending(defaultPending())
      setSaving(false)
    }
  }, [showDoseEntry])

  // Dismiss toast after a short delay
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  const actualPlan = getActivePlan('actual')
  const preview = useDosePreview(actualPlan, doseEntryStep === 'preview' ? pending : null)

  if (!showDoseEntry && !toast) return null

  function handleConfirm() {
    if (saving) return
    setSaving(true)

    let planId = actualPlan?.id
    if (!planId) {
      planId = addPlan('actual', 'My Doses')
    }

    addDose(planId, {
      date: pending.date,
      time: pending.time,
      amountMg: pending.amountMg,
    })

    setToast(`Saved ${pending.amountMg}mg`)
    closeDoseEntry()
    setSaving(false)
  }

  return (
    <>
      {showDoseEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40"
          onClick={closeDoseEntry}
        >
          <div
            className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 max-h-[92vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}
          >
            {doseEntryStep === 'enter' && (
              <DoseEntryForm
                value={pending}
                onChange={setPending}
                onNext={() => setDoseEntryStep('preview')}
                onCancel={closeDoseEntry}
              />
            )}
            {doseEntryStep === 'preview' && preview && (
              <DosePreview
                pending={pending}
                preview={preview}
                onBack={() => setDoseEntryStep('enter')}
                onConfirm={handleConfirm}
                saving={saving}
              />
            )}
            {doseEntryStep === 'preview' && !preview && (
              <div className="py-8 text-center text-text-secondary text-sm">
                Unable to preview this dose. Go back and check the values.
                <button
                  onClick={() => setDoseEntryStep('enter')}
                  className="block mx-auto mt-4 px-4 min-h-11 rounded-lg border border-border"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] bg-text text-surface px-4 py-2.5 rounded-full text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
