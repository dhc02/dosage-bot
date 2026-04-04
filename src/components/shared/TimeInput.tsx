interface Props {
  value: string; // HH:mm
  onChange: (value: string) => void;
  className?: string;
}

export function TimeInput({ value, onChange, className = '' }: Props) {
  const hour = parseInt(value.split(':')[0], 10)
  const isAM = hour < 12

  function toggleAMPM() {
    const [h, m] = value.split(':')
    let newHour = parseInt(h, 10)
    if (isAM) {
      newHour = newHour + 12
    } else {
      newHour = newHour - 12
    }
    onChange(`${String(newHour).padStart(2, '0')}:${m}`)
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="font-mono text-sm bg-transparent border-0 outline-none cursor-pointer w-[5.5rem]"
      />
      <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-semibold leading-none">
        <button
          type="button"
          onClick={isAM ? undefined : toggleAMPM}
          className={`px-1.5 py-1 transition-colors ${
            isAM
              ? 'bg-primary-100 text-primary-700'
              : 'bg-surface hover:bg-surface-alt text-text-secondary'
          }`}
        >
          AM
        </button>
        <button
          type="button"
          onClick={isAM ? toggleAMPM : undefined}
          className={`px-1.5 py-1 transition-colors border-l border-border ${
            !isAM
              ? 'bg-primary-100 text-primary-700'
              : 'bg-surface hover:bg-surface-alt text-text-secondary'
          }`}
        >
          PM
        </button>
      </div>
    </div>
  )
}
