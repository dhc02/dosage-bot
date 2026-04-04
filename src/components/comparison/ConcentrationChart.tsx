import { useState, useRef, useCallback, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
  Brush,
} from 'recharts'
import { format } from 'date-fns'

interface ChartDataPoint {
  timestamp: number;
  day: number;
  baseline?: number;
  experiment?: number;
  actual?: number;
}

interface DoseMarker {
  timestamp: number;
  day: number;
  type: string;
  mg: number;
}

interface Props {
  data: ChartDataPoint[];
  doseMarkers: DoseMarker[];
  baselineColor: string;
  experimentColor: string;
  actualColor: string;
  hasBaseline: boolean;
  hasExperiment: boolean;
  hasActual: boolean;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: number }) {
  if (!active || !payload || !label) return null

  const date = new Date(label)

  return (
    <div className="bg-surface border border-border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium text-text mb-1.5">
        {format(date, 'MMM d, yyyy HH:mm')}
      </div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="capitalize text-text-secondary">{entry.name}:</span>
          <span className="font-mono font-medium">{entry.value.toFixed(1)} ng/mL</span>
        </div>
      ))}
    </div>
  )
}

const ZOOM_FACTOR = 0.2
const MIN_RANGE_MS = 2 * 24 * 3600 * 1000 // minimum 2-day view

export function ConcentrationChart({
  data,
  doseMarkers,
  baselineColor,
  experimentColor,
  actualColor,
  hasBaseline,
  hasExperiment,
  hasActual,
}: Props) {
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchDistRef = useRef<number | null>(null)
  const prevDataLenRef = useRef(data.length)

  // Reset zoom when data changes significantly (plan switch, visibility toggle)
  if (data.length !== prevDataLenRef.current) {
    prevDataLenRef.current = data.length
    if (zoomDomain) setZoomDomain(null)
  }

  const fullMin = data.length > 0 ? data[0].timestamp : 0
  const fullMax = data.length > 0 ? data[data.length - 1].timestamp : 0

  const xMin = zoomDomain ? zoomDomain[0] : fullMin
  const xMax = zoomDomain ? zoomDomain[1] : fullMax

  // Auto-scale Y to visible data
  const visibleData = zoomDomain
    ? data.filter(d => d.timestamp >= zoomDomain[0] && d.timestamp <= zoomDomain[1])
    : data

  const maxConc = visibleData.reduce((max, d) => {
    const vals = [d.baseline ?? 0, d.experiment ?? 0, d.actual ?? 0]
    return Math.max(max, ...vals)
  }, 0)

  const yMax = Math.ceil(maxConc / 50) * 50 + 50

  const zoom = useCallback((direction: number, centerFraction: number = 0.5) => {
    const currentMin = zoomDomain ? zoomDomain[0] : fullMin
    const currentMax = zoomDomain ? zoomDomain[1] : fullMax
    const range = currentMax - currentMin

    const delta = range * ZOOM_FACTOR * direction
    const newMin = currentMin + delta * centerFraction
    const newMax = currentMax - delta * (1 - centerFraction)

    // Clamp
    const clampedMin = Math.max(fullMin, newMin)
    const clampedMax = Math.min(fullMax, newMax)

    if (clampedMax - clampedMin < MIN_RANGE_MS) return
    if (clampedMin >= clampedMax) return

    // If we're back to (near) full range, reset
    if (clampedMax - clampedMin >= fullMax - fullMin - 3600000) {
      setZoomDomain(null)
    } else {
      setZoomDomain([clampedMin, clampedMax])
    }
  }, [zoomDomain, fullMin, fullMax])

  // Wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      // Only zoom when over the chart area
      if (!e.ctrlKey && !e.metaKey) {
        // Regular scroll — require Ctrl/Cmd to zoom, otherwise let page scroll
        return
      }
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const centerFraction = (e.clientX - rect.left) / rect.width
      const direction = e.deltaY > 0 ? -1 : 1 // scroll up = zoom in
      zoom(direction, centerFraction)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [zoom])

  // Touch pinch zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function getTouchDist(e: TouchEvent): number {
      if (e.touches.length < 2) return 0
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        touchDistRef.current = getTouchDist(e)
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && touchDistRef.current !== null) {
        e.preventDefault()
        const newDist = getTouchDist(e)
        const delta = newDist - touchDistRef.current
        if (Math.abs(delta) > 10) {
          zoom(delta > 0 ? 1 : -1, 0.5)
          touchDistRef.current = newDist
        }
      }
    }

    function handleTouchEnd() {
      touchDistRef.current = null
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [zoom])

  // Brush onChange
  function handleBrushChange(brush: { startIndex?: number; endIndex?: number }) {
    if (brush.startIndex == null || brush.endIndex == null) return
    if (brush.startIndex === 0 && brush.endIndex === data.length - 1) {
      setZoomDomain(null)
      return
    }
    const start = data[brush.startIndex]?.timestamp
    const end = data[brush.endIndex]?.timestamp
    if (start != null && end != null && end - start >= MIN_RANGE_MS) {
      setZoomDomain([start, end])
    }
  }

  const isZoomed = zoomDomain !== null

  // Visible dose markers
  const visibleMarkers = zoomDomain
    ? doseMarkers.filter(m => m.timestamp >= zoomDomain[0] && m.timestamp <= zoomDomain[1])
    : doseMarkers

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Blood Serum Concentration</h3>
        <div className="flex items-center gap-2">
          {isZoomed && (
            <button
              onClick={() => setZoomDomain(null)}
              className="text-[10px] px-2 py-0.5 rounded border border-border text-text-secondary hover:bg-surface-alt transition-colors"
            >
              Reset zoom
            </button>
          )}
          <span className="text-[10px] text-text-secondary">
            {isZoomed ? 'Ctrl+scroll to zoom' : 'Ctrl+scroll to zoom'}
          </span>
        </div>
      </div>
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={[xMin, xMax]}
              tickFormatter={(ts: number) => format(new Date(ts), 'MMM d')}
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              allowDataOverflow
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              label={{ value: 'ng/mL', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#94a3b8' } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />

            {hasBaseline && (
              <Line
                type="monotone"
                dataKey="baseline"
                stroke={baselineColor}
                strokeWidth={2}
                dot={false}
                name="Baseline"
                connectNulls={false}
              />
            )}
            {hasExperiment && (
              <Line
                type="monotone"
                dataKey="experiment"
                stroke={experimentColor}
                strokeWidth={2}
                dot={false}
                name="Experiment"
                connectNulls={false}
              />
            )}
            {hasActual && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke={actualColor}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="Actual"
                connectNulls={false}
              />
            )}

            {/* Dose markers */}
            {visibleMarkers.map((m, i) => {
              const color = m.type === 'baseline' ? baselineColor
                : m.type === 'experiment' ? experimentColor
                : actualColor
              return (
                <ReferenceDot
                  key={i}
                  x={m.timestamp}
                  y={0}
                  r={4}
                  fill={color}
                  stroke="white"
                  strokeWidth={1.5}
                />
              )
            })}

            {data.length > 1 && (
              <Brush
                key={data.length}
                dataKey="timestamp"
                height={24}
                stroke="#cbd5e1"
                fill="#f8fafc"
                travellerWidth={8}
                onChange={handleBrushChange}
                tickFormatter={(ts: number) => format(new Date(ts), 'MMM d')}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
