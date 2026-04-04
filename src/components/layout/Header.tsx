import { PatientSelector } from '../patient/PatientSelector'

export function Header() {
  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-text">Tirzepatide PK Scheduler</h1>
      </div>
      <PatientSelector />
    </header>
  )
}
