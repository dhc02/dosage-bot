import { PlanManager } from '../plans/PlanManager'

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-border bg-surface overflow-y-auto shrink-0">
      <PlanManager />
    </aside>
  )
}
