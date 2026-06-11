import { useState, useEffect } from 'react'
import { PatientSelector } from '../patient/PatientSelector'
import { ViewModeToggle } from '../shared/ViewModeToggle'
import { UndoRedoButtons } from '../shared/UndoRedoButtons'
import { ChangelogPanel } from '../shared/ChangelogPanel'
import { usePatientStore } from '../../store/patient-store'

export function Header() {
  const [showChangelog, setShowChangelog] = useState(false)
  const undo = usePatientStore(s => s.undo)
  const redo = usePatientStore(s => s.redo)
  const hasUndo = usePatientStore(s => s.hasUndo)
  const hasRedo = usePatientStore(s => s.hasRedo)

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (hasUndo()) undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (hasRedo()) redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, hasUndo, hasRedo])

  return (
    <>
      <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text">Tirzepatide PK Scheduler</h1>
          <UndoRedoButtons onOpenHistory={() => setShowChangelog(true)} />
        </div>
        <div className="flex items-center gap-3">
          <ViewModeToggle />
          <PatientSelector />
        </div>
      </header>
      {showChangelog && <ChangelogPanel onClose={() => setShowChangelog(false)} />}
    </>
  )
}
