import type { ReactNode } from 'react'
import type { MobileTab } from '../../store/ui-store'

interface Props {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: Array<{ id: MobileTab; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Today', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )},
  { id: 'chart', label: 'Chart', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  )},
  { id: 'logs', label: 'Logs', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  )},
]

export function MobileBottomNav({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)] z-40">
      <div className="flex">
        {TABS.map(tab => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-1 h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-primary-600' : 'text-text-secondary'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
