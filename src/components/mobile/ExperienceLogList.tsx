import { format } from 'date-fns'
import type { ExperienceLog } from '../../types'

interface Props {
  logs: ExperienceLog[];
  onDelete: (id: string) => void;
}

export function ExperienceLogList({ logs, onDelete }: Props) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary text-sm">
        No logs yet. Tap "Log How I Feel" on the dashboard to get started.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {logs.map(log => (
        <LogCard key={log.id} log={log} onDelete={onDelete} />
      ))}
    </div>
  )
}

function LogCard({ log, onDelete }: { log: ExperienceLog; onDelete: (id: string) => void }) {
  const date = new Date(log.timestamp)
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text">
            {format(date, 'MMM d, yyyy')} <span className="text-text-secondary font-normal">· {format(date, 'h:mm a')}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
            <span className="capitalize px-2 py-0.5 rounded-full bg-surface-alt">{log.mentalState}</span>
            <span>Hunger {log.hungerLevel}/10</span>
            <span>Energy {log.energyLevel}/10</span>
          </div>
          {log.serumConcentration != null && (
            <div className="mt-2 text-xs text-text-secondary font-mono">
              Serum: {log.serumConcentration.toFixed(1)} ng/mL
              {log.slopeNgPerMlPerHour != null && (
                <span> · Trend: {(log.slopeNgPerMlPerHour * 24 >= 0 ? '+' : '')}{(log.slopeNgPerMlPerHour * 24).toFixed(2)}/day</span>
              )}
              {log.hoursSinceLastDose != null && (
                <span> · {log.hoursSinceLastDose.toFixed(1)}h since dose</span>
              )}
              {log.hoursUntilPeak != null && (
                <span> · Peak in {log.hoursUntilPeak.toFixed(1)}h</span>
              )}
              {log.hoursSincePeak != null && (
                <span> · Peak {log.hoursSincePeak.toFixed(1)}h ago</span>
              )}
            </div>
          )}
          {log.notes && (
            <div className="mt-2 text-sm text-text whitespace-pre-wrap">{log.notes}</div>
          )}
        </div>
        <button
          onClick={() => onDelete(log.id)}
          className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-500"
          aria-label="Delete log"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
