import { useState, useRef, useEffect } from 'react'
import { usePatientStore } from '../../store/patient-store'

export function PatientSelector() {
  const { patients, activePatientId, setActivePatient, addPatient, removePatient, renamePatient } = usePatientStore()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const activePatient = patients.find(p => p.patient.id === activePatientId)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setEditing(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleAdd() {
    const name = `Patient ${patients.length + 1}`
    addPatient(name)
    setOpen(false)
  }

  function startEditing(id: string, name: string) {
    setEditing(id)
    setEditName(name)
  }

  function commitRename(id: string) {
    if (editName.trim()) {
      renamePatient(id, editName.trim())
    }
    setEditing(null)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-surface-alt transition-colors text-sm font-medium"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        {activePatient?.patient.name ?? 'Select patient'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded-lg shadow-lg z-50">
          <div className="p-1">
            {patients.map(pd => (
              <div
                key={pd.patient.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer group ${
                  pd.patient.id === activePatientId ? 'bg-primary-50 text-primary-700' : 'hover:bg-surface-alt'
                }`}
              >
                {editing === pd.patient.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => commitRename(pd.patient.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(pd.patient.id)
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    className="flex-1 px-1 py-0.5 text-sm border border-primary-300 rounded outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1"
                      onClick={() => { setActivePatient(pd.patient.id); setOpen(false) }}
                    >
                      {pd.patient.name}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditing(pd.patient.id, pd.patient.name) }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-primary-100 rounded"
                      title="Rename"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {patients.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removePatient(pd.patient.id) }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 text-red-500 rounded"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-1">
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-primary-600 hover:bg-primary-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Patient
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
