import { format, parseISO, min, max, addDays } from 'date-fns'
import type { Dose } from '../types'

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d, yyyy')
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d')
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Get the date range that covers all doses, with padding.
 */
export function doseDateRange(
  doses: Dose[],
  paddingDaysBefore: number = 1,
  paddingDaysAfter: number = 14,
): { start: Date; end: Date } {
  if (doses.length === 0) {
    const now = new Date()
    return {
      start: addDays(now, -paddingDaysBefore),
      end: addDays(now, paddingDaysAfter),
    }
  }

  const dates = doses.map(d => parseISO(d.date))
  const earliest = min(dates)
  const latest = max(dates)

  return {
    start: addDays(earliest, -paddingDaysBefore),
    end: addDays(latest, paddingDaysAfter),
  }
}
