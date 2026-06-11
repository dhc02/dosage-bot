import { useState } from 'react'
import { usePatientStore } from '../../store/patient-store'

interface Props {
  onOpenHistory: () => void
}

export function UndoRedoButtons({ onOpenHistory }: Props) {
  const undo = usePatientStore(s => s.undo)
  const redo = usePatientStore(s => s.redo)
  const hasUndo = usePatientStore(s => s.hasUndo)
  const hasRedo = usePatientStore(s => s.hasRedo)
  const [toast, setToast] = useState<string | null>(null)

  const handleUndo = () => {
    undo()
    showToast('Undo')
  }

  const handleRedo = () => {
    redo()
    showToast('Redo')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1500)
  }

  return (
    <div className="flex items-center gap-1 relative">
      <button
        onClick={handleUndo}
        disabled={!hasUndo()}
        className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Undo (Ctrl+Z)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        onClick={handleRedo}
        disabled={!hasRedo()}
        className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={onOpenHistory}
        className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-hover transition-colors"
        title="Change History"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {toast && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 text-[11px] font-medium rounded bg-text text-surface whitespace-nowrap shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
