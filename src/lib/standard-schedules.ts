import { nanoid } from 'nanoid'
import { addDays, format } from 'date-fns'
import type { Dose } from '../types'

/**
 * Generate the FDA-approved tirzepatide titration schedule:
 * 2.5mg q7d for 4 weeks, then 5mg q7d for 4 weeks, then 7.5mg, 10mg, 15mg (each 4 weeks).
 */
export function generateStandardTitration(startDate: Date, time: string = '08:00'): Dose[] {
  const doses: Dose[] = []
  const steps: Array<{ mg: number; weeks: number }> = [
    { mg: 2.5, weeks: 4 },
    { mg: 5, weeks: 4 },
    { mg: 7.5, weeks: 4 },
    { mg: 10, weeks: 4 },
    { mg: 15, weeks: 4 },
  ]

  let dayOffset = 0
  for (const step of steps) {
    for (let w = 0; w < step.weeks; w++) {
      const date = addDays(startDate, dayOffset)
      doses.push({
        id: nanoid(),
        date: format(date, 'yyyy-MM-dd'),
        time,
        amountMg: step.mg,
        note: w === 0 && dayOffset > 0 ? `Titrate to ${step.mg}mg` : undefined,
      })
      dayOffset += 7
    }
  }

  return doses
}

/**
 * Generate a simple repeating dose schedule.
 */
export function generateRepeatingSchedule(
  startDate: Date,
  doseMg: number,
  intervalDays: number,
  count: number,
  time: string = '08:00',
): Dose[] {
  const doses: Dose[] = []
  for (let i = 0; i < count; i++) {
    const date = addDays(startDate, i * intervalDays)
    doses.push({
      id: nanoid(),
      date: format(date, 'yyyy-MM-dd'),
      time,
      amountMg: doseMg,
    })
  }
  return doses
}
