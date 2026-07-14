interface Props {
  concentration: number;       // ng/mL at "now"
  hasActualPlan: boolean;
  lastDoseMg?: number | null;
  lastDoseDate?: string | null;
}

export function CurrentLevelCard({ concentration, hasActualPlan, lastDoseMg, lastDoseDate }: Props) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
        Current Serum Level
      </div>
      {hasActualPlan ? (
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-5xl font-mono font-semibold tabular-nums text-text">
            {concentration.toFixed(1)}
          </div>
          <div className="text-base text-text-secondary">ng/mL</div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-text-secondary">
          No "Actual" plan yet. Create one and log doses to see your current level.
        </div>
      )}
      {lastDoseMg != null && lastDoseMg > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-3">
          <div>
            <div className="text-xs text-text-secondary uppercase tracking-wider font-medium">Previous Dose</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-mono font-semibold tabular-nums text-text">
                {typeof lastDoseMg === 'number' && lastDoseMg % 1 === 0
                  ? lastDoseMg.toFixed(0)
                  : lastDoseMg.toFixed(1)}
              </span>
              <span className="text-sm text-text-secondary">mg</span>
            </div>
          </div>
          {lastDoseDate && (
            <div className="text-xs text-text-secondary ml-auto">
              {lastDoseDate}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
