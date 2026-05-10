import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { ExperienceLogList } from './ExperienceLogList'

export function MobileLogsView() {
  const { getExperienceLogs, removeExperienceLog } = usePatientStore()
  const { setShowExperienceLogForm } = useUIStore()
  const logs = getExperienceLogs()

  return (
    <div className="p-4 pb-32">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Experience Logs</h2>
        <button
          onClick={() => setShowExperienceLogForm(true)}
          className="min-h-11 px-4 rounded-full bg-primary-600 text-white text-sm font-semibold active:bg-primary-700"
        >
          + New
        </button>
      </div>
      <ExperienceLogList logs={logs} onDelete={removeExperienceLog} />
    </div>
  )
}
