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
