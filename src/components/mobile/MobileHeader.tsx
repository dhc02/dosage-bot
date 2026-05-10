import { PatientSelector } from '../patient/PatientSelector'
import { ViewModeToggle } from '../shared/ViewModeToggle'

export function MobileHeader() {
  return (
    <header className="bg-surface border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-primary-600 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-text truncate">Tirzepatide PK</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle />
          <PatientSelector />
        </div>
      </div>
    </header>
  )
}
