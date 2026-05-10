import { useUIStore } from '../../store/ui-store'
import { MobileHeader } from './MobileHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { MobileDashboard } from './MobileDashboard'
import { MobileChartView } from './MobileChartView'
import { MobileLogsView } from './MobileLogsView'
import { ExperienceLogForm } from './ExperienceLogForm'

export function MobileApp() {
  const { mobileActiveTab, setMobileActiveTab } = useUIStore()

  return (
    <div className="h-full flex flex-col bg-surface-alt">
      <MobileHeader />
      <main className="flex-1 overflow-y-auto">
        {mobileActiveTab === 'dashboard' && <MobileDashboard />}
        {mobileActiveTab === 'chart' && <MobileChartView />}
        {mobileActiveTab === 'logs' && <MobileLogsView />}
      </main>
      <MobileBottomNav active={mobileActiveTab} onChange={setMobileActiveTab} />
      <ExperienceLogForm />
    </div>
  )
}
