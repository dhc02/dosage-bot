import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { MobileApp } from './components/mobile/MobileApp'
import { useUIStore } from './store/ui-store'
import { useIsMobile } from './hooks/useIsMobile'

export default function App() {
  const { viewMode } = useUIStore()
  const isMobileViewport = useIsMobile()

  const effectiveMode: 'mobile' | 'desktop' =
    viewMode === 'auto' ? (isMobileViewport ? 'mobile' : 'desktop') : viewMode

  if (effectiveMode === 'mobile') {
    return <MobileApp />
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <footer className="px-4 py-2 text-center text-xs text-text-secondary border-t border-border bg-surface">
        Educational tool only — not medical advice. Discuss any dosing changes with your prescriber.
      </footer>
    </div>
  )
}
