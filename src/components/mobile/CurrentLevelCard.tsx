interface Props {
  concentration: number;       // ng/mL at "now"
  hasActualPlan: boolean;
}

export function CurrentLevelCard({ concentration, hasActualPlan }: Props) {
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
    </div>
  )
}
