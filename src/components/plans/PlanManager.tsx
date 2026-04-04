import { useState } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import type { PlanType } from '../../types'

const TYPE_CONFIG: Record<PlanType, { label: string; colorClass: string; bgClass: string }> = {
  baseline: { label: 'Baseline', colorClass: 'text-baseline', bgClass: 'bg-blue-50' },
  experiment: { label: 'Experiment', colorClass: 'text-experiment', bgClass: 'bg-amber-50' },
  actual: { label: 'Actual', colorClass: 'text-actual', bgClass: 'bg-emerald-50' },
}

export function PlanManager() {
  const { getActivePatient, addPlan, removePlan, setActivePlan, clonePlan, renamePlan } = usePatientStore()
  const { selectedPlanId, setSelectedPlanId, togglePlanVisibility, hiddenPlanIds } = useUIStore()
  const patientData = getActivePatient()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  if (!patientData) return null

  const { plans, activePlanIds } = patientData

  const plansByType = {
    baseline: plans.filter(p => p.type === 'baseline'),
    experiment: plans.filter(p => p.type === 'experiment'),
    actual: plans.filter(p => p.type === 'actual'),
  }

  function handleNewPlan(type: PlanType) {
    const name = type === 'actual'
      ? 'Actual Doses'
      : type === 'experiment'
        ? `Experiment ${plansByType.experiment.length + 1}`
        : `Baseline ${plansByType.baseline.length + 1}`
    const id = addPlan(type, name)
    setSelectedPlanId(id)
  }

  function handlePromoteToBaseline(planId: string) {
    const plan = plans.find(p => p.id === planId)
    if (!plan) return
    clonePlan(planId, 'baseline', `${plan.name} (promoted)`)
  }

  function startEditing(planId: string, name: string) {
    setEditingId(planId)
    setEditName(name)
  }

  function commitRename(planId: string) {
    if (editName.trim()) {
      renamePlan(planId, editName.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Plans</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {(['baseline', 'experiment', 'actual'] as const).map(type => {
          const config = TYPE_CONFIG[type]
          const typePlans = plansByType[type]
          const activeId = activePlanIds[type]

          return (
            <div key={type} className="border-b border-border">
              <div className="px-3 py-2 flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${config.colorClass}`}>
                  {config.label}
                </span>
                <button
                  onClick={() => handleNewPlan(type)}
                  className="p-0.5 hover:bg-surface-alt rounded"
                  title={`New ${config.label}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>

              {typePlans.length === 0 && (
                <div className="px-3 pb-2 text-xs text-text-secondary italic">
                  No {type} plans
                </div>
              )}

              {typePlans.map(plan => {
                const isActive = plan.id === activeId
                const isSelected = plan.id === selectedPlanId
                const visible = !hiddenPlanIds.includes(plan.id)

                return (
                  <div
                    key={plan.id}
                    className={`group px-3 py-2 flex items-center gap-2 cursor-pointer border-l-2 transition-colors ${
                      isSelected
                        ? 'bg-primary-50 border-l-primary-500'
                        : isActive
                          ? `${config.bgClass} border-l-transparent`
                          : 'border-l-transparent hover:bg-surface-alt'
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    <input
                      type="radio"
                      name={`active-${type}`}
                      checked={isActive}
                      onChange={() => setActivePlan(type, plan.id)}
                      onClick={e => e.stopPropagation()}
                      className="accent-primary-600"
                    />

                    {/* Visibility toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePlanVisibility(plan.id) }}
                      className={`p-0.5 rounded transition-colors ${visible ? 'text-text-secondary hover:text-text' : 'text-border hover:text-text-secondary'}`}
                      title={visible ? 'Hide from chart' : 'Show on chart'}
                    >
                      {visible ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      {editingId === plan.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={() => commitRename(plan.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename(plan.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          onClick={e => e.stopPropagation()}
                          className="w-full text-sm font-medium px-1 py-0.5 border border-primary-300 rounded outline-none bg-surface"
                        />
                      ) : (
                        <div
                          className={`text-sm font-medium truncate ${isSelected ? 'cursor-text' : ''}`}
                          onClick={(e) => {
                            if (isSelected) {
                              e.stopPropagation()
                              startEditing(plan.id, plan.name)
                            }
                          }}
                          title={isSelected ? 'Click to rename' : undefined}
                        >
                          {plan.name}
                        </div>
                      )}
                      <div className="text-xs text-text-secondary">
                        {plan.doses.length} dose{plan.doses.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                      {type === 'experiment' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePromoteToBaseline(plan.id) }}
                          className="p-1 hover:bg-blue-100 rounded text-blue-500"
                          title="Promote to baseline"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removePlan(plan.id) }}
                        className="p-1 hover:bg-red-100 rounded text-red-400"
                        title="Delete plan"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
