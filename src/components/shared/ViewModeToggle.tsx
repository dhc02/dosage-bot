import { useUIStore } from '../../store/ui-store'

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useUIStore()

  return (
    <div className="flex items-center rounded-full border border-border overflow-hidden text-[10px] font-semibold">
      {(['auto', 'mobile', 'desktop'] as const).map(mode => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`px-2.5 py-1 capitalize transition-colors ${
            viewMode === mode ? 'bg-primary-600 text-white' : 'text-text-secondary hover:bg-surface-alt'
          }`}
          title={`View mode: ${mode}`}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}
