import { describe, it, expect } from 'vitest'
import {
  singleDoseConcentration,
  eliminationRate,
  computeConcentrationCurve,
  computeMetrics,
  computeTmax,
  adjustVdForWeight,
  doseTimestamp,
  concentrationAtTime,
  singleDoseSlope,
  slopeAtTime,
  findNextPeakTime,
  findPreviousPeakTime,
} from './pk-engine'
import { DEFAULT_PK_PARAMS } from '../types'
import type { Dose } from '../types'

const params = DEFAULT_PK_PARAMS

describe('eliminationRate', () => {
  it('computes ke from half-life', () => {
    const ke = eliminationRate(5) // 5 days
    // ke = ln(2) / (5 * 24) = 0.6931 / 120 ≈ 0.005776
    expect(ke).toBeCloseTo(0.005776, 4)
  })
})

describe('computeTmax', () => {
  it('gives Tmax around 59 hours for default params', () => {
    // Tmax = ln(ka/ke) / (ka - ke)
    // ka=0.0373, ke=0.005776
    // ln(0.0373/0.005776) / (0.0373 - 0.005776) ≈ 59 hours
    const tmax = computeTmax(params)
    expect(tmax).toBeGreaterThan(50)
    expect(tmax).toBeLessThan(70)
  })
})

describe('singleDoseConcentration', () => {
  it('returns 0 at t=0', () => {
    expect(singleDoseConcentration(2.5, params, 0)).toBe(0)
  })

  it('returns 0 for negative time', () => {
    expect(singleDoseConcentration(2.5, params, -1)).toBe(0)
  })

  it('rises to a peak and then decays', () => {
    const t12h = singleDoseConcentration(2.5, params, 12)
    const t48h = singleDoseConcentration(2.5, params, 48)
    const t60h = singleDoseConcentration(2.5, params, 60)
    const t120h = singleDoseConcentration(2.5, params, 120)
    const t240h = singleDoseConcentration(2.5, params, 240)

    // Should rise: 12h < 48h
    expect(t48h).toBeGreaterThan(t12h)
    // Peak around 59h: 60h should be near peak
    expect(t60h).toBeGreaterThan(t12h)
    // Should decay after peak: 240h < 120h < 60h
    expect(t120h).toBeLessThan(t60h)
    expect(t240h).toBeLessThan(t120h)
  })

  it('produces reasonable peak for 2.5mg dose', () => {
    // Find peak by sampling around Tmax (~59 hours)
    let peak = 0
    for (let t = 40; t <= 80; t += 1) {
      const c = singleDoseConcentration(2.5, params, t)
      if (c > peak) peak = c
    }
    // The Excel Scenario Comparison sheet shows a single 2.5mg dose peaks around 118-119 ng/mL
    // Our model should give similar values. With Vd=10.3L, F=0.8:
    // Peak ≈ (0.8 * 2500 * 0.0373) / (10.3 * (0.0373 - 0.005776)) * (e^(-0.005776*59) - e^(-0.0373*59))
    // Let's just check it's in a reasonable range (80-200 ng/mL)
    expect(peak).toBeGreaterThan(80)
    expect(peak).toBeLessThan(200)
  })

  it('scales linearly with dose', () => {
    const c25 = singleDoseConcentration(2.5, params, 60)
    const c50 = singleDoseConcentration(5.0, params, 60)
    expect(c50 / c25).toBeCloseTo(2.0, 5)
  })
})

describe('concentrationAtTime (superposition)', () => {
  it('sums contributions from multiple doses', () => {
    const doses: Dose[] = [
      { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 },
      { id: '2', date: '2026-04-02', time: '08:00', amountMg: 2.5 },
    ]

    // At the time of the second dose, the first dose has been decaying for 7 days (168 hours)
    const secondDoseMs = doseTimestamp(doses[1])

    // 1 hour after second dose
    const c = concentrationAtTime(doses, params, secondDoseMs + 3600 * 1000)

    // Should be > single dose at 1 hour (because first dose residual adds)
    const singleAt1h = singleDoseConcentration(2.5, params, 1)
    const singleAt169h = singleDoseConcentration(2.5, params, 169)
    expect(c).toBeCloseTo(singleAt1h + singleAt169h, 2)
  })
})

describe('computeConcentrationCurve', () => {
  it('produces expected number of points', () => {
    const doses: Dose[] = [
      { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 },
    ]
    const start = new Date('2026-03-26T00:00:00')
    const end = new Date('2026-03-27T00:00:00')
    const curve = computeConcentrationCurve(doses, params, start, end, 1)
    // 24 hours + 1 for endpoint = 25 points
    expect(curve.length).toBe(25)
  })

  it('all concentrations are non-negative', () => {
    const doses: Dose[] = [
      { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 },
    ]
    const start = new Date('2026-03-25T00:00:00')
    const end = new Date('2026-04-10T00:00:00')
    const curve = computeConcentrationCurve(doses, params, start, end, 6)
    for (const p of curve) {
      expect(p.concentration).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('computeMetrics', () => {
  it('computes basic metrics for a multi-dose schedule', () => {
    // 4 weekly doses of 2.5mg
    const doses: Dose[] = []
    for (let w = 0; w < 4; w++) {
      const day = 26 + w * 7
      const month = day > 31 ? '04' : '03'
      const d = day > 31 ? day - 31 : day
      doses.push({
        id: String(w),
        date: `2026-${month}-${String(d).padStart(2, '0')}`,
        time: '08:00',
        amountMg: 2.5,
      })
    }

    const start = new Date('2026-03-26T00:00:00')
    const end = new Date('2026-05-07T00:00:00')
    const curve = computeConcentrationCurve(doses, params, start, end, 2)
    const metrics = computeMetrics(curve, doses)

    expect(metrics.injectionCount).toBe(4)
    expect(metrics.totalDoseMg).toBe(10)
    expect(metrics.peakConcentration).toBeGreaterThan(0)
    expect(metrics.troughConcentration).toBeGreaterThan(0)
    expect(metrics.peakTroughRatio).toBeGreaterThan(1)
    expect(metrics.timeInEffectiveZonePct).toBeGreaterThan(0)
    expect(metrics.timeInEffectiveZonePct).toBeLessThanOrEqual(100)
    // 10mg over 3 weeks (first to last dose span) ≈ 3.33 mg/wk
    expect(metrics.avgMgPerWeek).toBeGreaterThan(2)
    expect(metrics.avgMgPerWeek).toBeLessThan(5)
  })
})

describe('adjustVdForWeight', () => {
  it('returns reference Vd at reference weight', () => {
    expect(adjustVdForWeight(70)).toBeCloseTo(10.3, 1)
  })

  it('scales proportionally', () => {
    // 100kg should give ~14.7L
    expect(adjustVdForWeight(100)).toBeCloseTo(14.71, 1)
  })
})

describe('per-dose weight adjustment', () => {
  it('heavier weight produces lower concentration (larger Vd)', () => {
    // 132 lbs ≈ 60kg, 220 lbs ≈ 100kg
    const doseLight: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5, weightLbs: 132 }
    const doseHeavy: Dose = { id: '2', date: '2026-03-26', time: '08:00', amountMg: 2.5, weightLbs: 220 }
    const doseNoWeight: Dose = { id: '3', date: '2026-03-26', time: '08:00', amountMg: 2.5 }

    const ts = doseTimestamp(doseLight) + 60 * 3600 * 1000 // 60 hours after

    const cLight = concentrationAtTime([doseLight], params, ts)
    const cHeavy = concentrationAtTime([doseHeavy], params, ts)
    const cDefault = concentrationAtTime([doseNoWeight], params, ts)

    // Lighter person → higher concentration (smaller Vd)
    expect(cLight).toBeGreaterThan(cHeavy)
    // No weight → uses default params Vd (10.3L, equivalent to 70kg/154lbs)
    expect(cDefault).toBeGreaterThan(cHeavy)
    expect(cDefault).toBeLessThan(cLight)
  })

  it('plan defaultWeightLbs applies when dose has no weight', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    const ts = doseTimestamp(dose) + 60 * 3600 * 1000

    const cNoDefault = concentrationAtTime([dose], params, ts)
    const cHeavyDefault = concentrationAtTime([dose], params, ts, 220)

    // 220 lbs → larger Vd → lower concentration than bare default (70kg/154lbs)
    expect(cHeavyDefault).toBeLessThan(cNoDefault)
  })

  it('per-dose weight overrides plan default', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5, weightLbs: 132 }
    const ts = doseTimestamp(dose) + 60 * 3600 * 1000

    // Dose says 132 lbs, plan default says 220 lbs — dose should win
    const cWithOverride = concentrationAtTime([dose], params, ts, 220)
    const cHeavyDefault = concentrationAtTime(
      [{ ...dose, weightLbs: undefined }], params, ts, 220
    )

    // 132 lbs (dose override) → smaller Vd → higher concentration
    expect(cWithOverride).toBeGreaterThan(cHeavyDefault)
  })
})

describe('singleDoseSlope', () => {
  it('returns 0 for t<=0', () => {
    expect(singleDoseSlope(2.5, params, 0)).toBe(0)
    expect(singleDoseSlope(2.5, params, -5)).toBe(0)
  })

  it('is positive between t=0+ and Tmax', () => {
    // Tmax ≈ 59 hours for default params
    expect(singleDoseSlope(2.5, params, 1)).toBeGreaterThan(0)
    expect(singleDoseSlope(2.5, params, 30)).toBeGreaterThan(0)
  })

  it('is approximately zero at Tmax (peak)', () => {
    const tmax = computeTmax(params)
    const slope = singleDoseSlope(2.5, params, tmax)
    expect(Math.abs(slope)).toBeLessThan(0.05) // ng/mL/hr
  })

  it('is negative after Tmax', () => {
    expect(singleDoseSlope(2.5, params, 120)).toBeLessThan(0)
    expect(singleDoseSlope(2.5, params, 240)).toBeLessThan(0)
  })

  it('decays toward zero at very large t', () => {
    expect(Math.abs(singleDoseSlope(2.5, params, 24 * 60))).toBeLessThan(0.01)
  })

  it('scales linearly with dose', () => {
    const s25 = singleDoseSlope(2.5, params, 30)
    const s50 = singleDoseSlope(5.0, params, 30)
    expect(s50 / s25).toBeCloseTo(2.0, 5)
  })

  it('matches a numerical central-difference approximation', () => {
    // dC/dt ≈ (C(t+h) - C(t-h)) / (2h)
    const t = 36
    const h = 0.01
    const numerical = (singleDoseConcentration(2.5, params, t + h) - singleDoseConcentration(2.5, params, t - h)) / (2 * h)
    const analytical = singleDoseSlope(2.5, params, t)
    expect(analytical).toBeCloseTo(numerical, 3)
  })
})

describe('findNextPeakTime', () => {
  it('finds the peak near single-dose Tmax for a lone dose', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    const doseMs = doseTimestamp(dose)
    // Check 10 hours after dose — clearly still rising
    const checkMs = doseMs + 10 * 3600 * 1000

    const peakMs = findNextPeakTime([dose], params, checkMs)
    expect(peakMs).not.toBeNull()

    const hoursAfterDose = (peakMs! - doseMs) / 3600000
    const tmax = computeTmax(params)
    // Should match analytical Tmax within ~15-min search granularity
    expect(Math.abs(hoursAfterDose - tmax)).toBeLessThan(0.5)
  })

  it('returns a time where the slope is approximately zero', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    const checkMs = doseTimestamp(dose) + 10 * 3600 * 1000
    const peakMs = findNextPeakTime([dose], params, checkMs)
    expect(peakMs).not.toBeNull()
    const slopeAtPeak = slopeAtTime([dose], params, peakMs!)
    expect(Math.abs(slopeAtPeak)).toBeLessThan(0.05)
  })

  it('returns null when already past the peak (slope negative)', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    // 120h after dose — well past single-dose Tmax (~59h)
    const checkMs = doseTimestamp(dose) + 120 * 3600 * 1000
    expect(findNextPeakTime([dose], params, checkMs)).toBeNull()
  })

  it('returns null when there are no doses in the past', () => {
    const dose: Dose = { id: '1', date: '2099-01-01', time: '08:00', amountMg: 2.5 }
    expect(findNextPeakTime([dose], params, Date.now())).toBeNull()
  })

  it('finds combined peak BEFORE single-dose Tmax at steady state', () => {
    // Bug scenario: weekly 5mg doses for many weeks. Right after a fresh dose,
    // the combined curve peaks earlier than 59h because the prior-dose decay
    // pulls the total slope to zero before the new dose alone would peak.
    const doses: Dose[] = []
    const base = new Date('2026-01-01T08:00:00')
    for (let w = 0; w < 12; w++) {
      const d = new Date(base)
      d.setDate(d.getDate() + w * 7)
      doses.push({
        id: String(w),
        date: d.toISOString().slice(0, 10),
        time: '08:00',
        amountMg: 5.0,
      })
    }
    const lastDoseMs = doseTimestamp(doses[doses.length - 1])
    // Check 5h after the most recent dose — slope should still be positive
    const checkMs = lastDoseMs + 5 * 3600 * 1000

    const peakMs = findNextPeakTime(doses, params, checkMs)
    expect(peakMs).not.toBeNull()

    const hoursAfterLast = (peakMs! - lastDoseMs) / 3600000
    const tmaxSingle = computeTmax(params)
    // Steady-state combined peak occurs earlier than single-dose Tmax
    expect(hoursAfterLast).toBeLessThan(tmaxSingle)
    // But still in the future from the check point
    expect(peakMs!).toBeGreaterThan(checkMs)
  })

  it('reports "past peak" earlier than single-dose Tmax at steady state (the bug case)', () => {
    // The bug: a user at steady state on a downslope sees "Nh until peak" even
    // though slope is already negative. After a fresh dose at steady state,
    // somewhere between the actual combined peak and single-dose Tmax (~59h),
    // the slope is negative — and findNextPeakTime must return null.
    const doses: Dose[] = []
    const base = new Date('2026-01-01T08:00:00')
    for (let w = 0; w < 12; w++) {
      const d = new Date(base)
      d.setDate(d.getDate() + w * 7)
      doses.push({
        id: String(w),
        date: d.toISOString().slice(0, 10),
        time: '08:00',
        amountMg: 5.0,
      })
    }
    const lastDoseMs = doseTimestamp(doses[doses.length - 1])
    // 50h after dose — buggy code (using 59h Tmax) would say "9h until peak"
    const checkMs = lastDoseMs + 50 * 3600 * 1000

    const slope = slopeAtTime(doses, params, checkMs)
    expect(slope).toBeLessThan(0) // confirm we're actually on the downslope

    expect(findNextPeakTime(doses, params, checkMs)).toBeNull()
  })
})

describe('findPreviousPeakTime', () => {
  it('finds the previous peak near single-dose Tmax for a lone dose', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    const doseMs = doseTimestamp(dose)
    // Check 120h after dose — well past Tmax (~59h), so we're on the downslope
    const checkMs = doseMs + 120 * 3600 * 1000

    const peakMs = findPreviousPeakTime([dose], params, checkMs)
    expect(peakMs).not.toBeNull()

    const hoursAfterDose = (peakMs! - doseMs) / 3600000
    const tmax = computeTmax(params)
    // Should match analytical Tmax within ~15-min search granularity
    expect(Math.abs(hoursAfterDose - tmax)).toBeLessThan(0.5)
  })

  it('returns a time where the slope is approximately zero', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    const checkMs = doseTimestamp(dose) + 120 * 3600 * 1000
    const peakMs = findPreviousPeakTime([dose], params, checkMs)
    expect(peakMs).not.toBeNull()
    const slopeAtPeak = slopeAtTime([dose], params, peakMs!)
    expect(Math.abs(slopeAtPeak)).toBeLessThan(0.05)
  })

  it('returns null when still on upslope (slope positive)', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    // 10h after dose — still rising
    const checkMs = doseTimestamp(dose) + 10 * 3600 * 1000
    expect(findPreviousPeakTime([dose], params, checkMs)).toBeNull()
  })

  it('returns null when there are no doses in the past', () => {
    const dose: Dose = { id: '1', date: '2099-01-01', time: '08:00', amountMg: 2.5 }
    expect(findPreviousPeakTime([dose], params, Date.now())).toBeNull()
  })

  it('returns null when the only past peak is more than 7 days back', () => {
    const dose: Dose = { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 }
    // 15 days after dose — peak (~59h after dose) is far outside the 7-day search window
    const checkMs = doseTimestamp(dose) + 15 * 24 * 3600 * 1000
    expect(findPreviousPeakTime([dose], params, checkMs)).toBeNull()
  })

  it('finds the most recent peak between two doses at steady state', () => {
    // Weekly 5mg doses. After a fresh dose at steady state, the combined peak
    // happens fairly soon (well before single-dose Tmax). Walking back from later
    // in the week, findPreviousPeakTime should pick the post-dose peak, not the
    // tail of the prior week's peak.
    const doses: Dose[] = []
    const base = new Date('2026-01-01T08:00:00')
    for (let w = 0; w < 12; w++) {
      const d = new Date(base)
      d.setDate(d.getDate() + w * 7)
      doses.push({
        id: String(w),
        date: d.toISOString().slice(0, 10),
        time: '08:00',
        amountMg: 5.0,
      })
    }
    const lastDoseMs = doseTimestamp(doses[doses.length - 1])
    // 60h after last dose — past the combined peak, before next dose
    const checkMs = lastDoseMs + 60 * 3600 * 1000
    expect(slopeAtTime(doses, params, checkMs)).toBeLessThan(0)

    const peakMs = findPreviousPeakTime(doses, params, checkMs)
    expect(peakMs).not.toBeNull()
    // Peak must be after the most recent dose and before the check time
    expect(peakMs!).toBeGreaterThan(lastDoseMs)
    expect(peakMs!).toBeLessThan(checkMs)
  })
})

describe('slopeAtTime (superposition)', () => {
  it('sums per-dose slopes', () => {
    const doses: Dose[] = [
      { id: '1', date: '2026-03-26', time: '08:00', amountMg: 2.5 },
      { id: '2', date: '2026-04-02', time: '08:00', amountMg: 5.0 },
    ]
    const ts = doseTimestamp(doses[1]) + 30 * 3600 * 1000 // 30h after dose 2
    const total = slopeAtTime(doses, params, ts)

    // Dose 1 has been running 7d + 30h = 198h; dose 2 has been running 30h
    const s1 = singleDoseSlope(2.5, params, 198)
    const s2 = singleDoseSlope(5.0, params, 30)
    expect(total).toBeCloseTo(s1 + s2, 6)
  })

  it('returns 0 if no doses are in the past', () => {
    const doses: Dose[] = [
      { id: '1', date: '2099-01-01', time: '08:00', amountMg: 2.5 },
    ]
    expect(slopeAtTime(doses, params, Date.now())).toBe(0)
  })
})
