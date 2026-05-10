import type { Dose, PKParams, ConcentrationPoint, PlanMetrics } from '../types'
import { lbsToKg } from '../types'

/**
 * One-compartment PK model with first-order absorption for subcutaneous tirzepatide.
 *
 * C(t) = (F * D * ka) / (Vd * (ka - ke)) * (e^(-ke*t) - e^(-ka*t))
 *
 * Where:
 *   F   = bioavailability (0.80)
 *   D   = dose in micrograms (mg * 1000)
 *   ka  = absorption rate constant (0.0373/hr, from pop PK study)
 *   ke  = elimination rate constant = ln(2) / (halfLife_days * 24) in /hr
 *   Vd  = volume of distribution in L
 *   t   = time since dose in hours
 *
 * Multiple doses use the superposition principle.
 */

export function eliminationRate(halfLifeDays: number): number {
  return Math.LN2 / (halfLifeDays * 24) // per hour
}

/**
 * Concentration contribution from a single dose at time t hours after injection.
 * Returns ng/mL.
 */
export function singleDoseConcentration(
  doseMg: number,
  params: PKParams,
  tHours: number,
): number {
  if (tHours <= 0) return 0

  const ke = eliminationRate(params.halfLifeDays)
  const ka = params.absorptionRateKa
  const F = params.bioavailability
  const Vd = params.volumeOfDistL
  const D = doseMg * 1000 // convert mg to micrograms

  // Guard against ka === ke (would divide by zero)
  if (Math.abs(ka - ke) < 1e-10) {
    // Limiting case: C(t) = (F * D * ka * t / Vd) * e^(-ke*t)
    return (F * D * ka * tHours) / Vd * Math.exp(-ke * tHours)
  }

  const coeff = (F * D * ka) / (Vd * (ka - ke))
  return coeff * (Math.exp(-ke * tHours) - Math.exp(-ka * tHours))
}

/**
 * Convert a Dose's date+time to a timestamp in ms.
 */
export function doseTimestamp(dose: Dose): number {
  return new Date(`${dose.date}T${dose.time}:00`).getTime()
}

/**
 * Resolve the effective weight for each dose in a chronologically sorted list.
 * A dose's explicit weightLbs carries forward to all subsequent doses until
 * another dose sets its own. Falls back to defaultWeightLbs (plan starting weight).
 */
export function resolveWeights(
  sortedDoses: Dose[],
  defaultWeightLbs?: number,
): Array<number | undefined> {
  const weights: Array<number | undefined> = []
  let carry = defaultWeightLbs
  for (const dose of sortedDoses) {
    if (dose.weightLbs != null) carry = dose.weightLbs
    weights.push(carry)
  }
  return weights
}

/**
 * Compute the total concentration at a given timestamp by summing
 * contributions from all prior doses (superposition principle).
 *
 * Weight cascades forward: if dose N sets a weight, doses N+1, N+2...
 * inherit it until another dose overrides. Falls back to defaultWeightLbs
 * (the plan's starting weight), then to the plan's pkParams.volumeOfDistL.
 *
 * Since Vd only appears as a scaling coefficient (not in the exponentials),
 * using different Vd per dose is mathematically clean under superposition.
 */
export function concentrationAtTime(
  doses: Dose[],
  params: PKParams,
  timestampMs: number,
  defaultWeightLbs?: number,
): number {
  const weights = resolveWeights(doses, defaultWeightLbs)
  let total = 0
  for (let i = 0; i < doses.length; i++) {
    const doseMs = doseTimestamp(doses[i])
    const tHours = (timestampMs - doseMs) / (1000 * 3600)
    if (tHours > 0) {
      const effectiveParams = weights[i]
        ? { ...params, volumeOfDistL: adjustVdForWeight(lbsToKg(weights[i]!), 70, params.volumeOfDistL) }
        : params
      total += singleDoseConcentration(doses[i].amountMg, effectiveParams, tHours)
    }
  }
  return total
}

/**
 * Compute a concentration curve over a date range.
 */
export function computeConcentrationCurve(
  doses: Dose[],
  params: PKParams,
  startDate: Date,
  endDate: Date,
  resolutionHours: number = 1,
  defaultWeightLbs?: number,
): ConcentrationPoint[] {
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()
  const stepMs = resolutionHours * 3600 * 1000
  const points: ConcentrationPoint[] = []

  // Sort doses by time for minor optimization
  const sortedDoses = [...doses].sort((a, b) => doseTimestamp(a) - doseTimestamp(b))

  for (let ms = startMs; ms <= endMs; ms += stepMs) {
    const concentration = concentrationAtTime(sortedDoses, params, ms, defaultWeightLbs)
    points.push({
      timestamp: ms,
      hours: (ms - startMs) / (3600 * 1000),
      concentration,
    })
  }

  return points
}

/**
 * Compute summary metrics from a concentration curve.
 */
export function computeMetrics(
  curve: ConcentrationPoint[],
  doses: Dose[],
  effectiveThresholdFraction: number = 0.3,
): PlanMetrics {
  const empty: PlanMetrics = {
    peakConcentration: 0,
    troughConcentration: 0,
    averageConcentration: 0,
    peakTroughRatio: 0,
    timeInEffectiveZonePct: 0,
    totalDoseMg: 0,
    injectionCount: 0,
    avgMgPerWeek: 0,
  }

  if (curve.length === 0 || doses.length === 0) return empty

  const totalDoseMg = doses.reduce((s, d) => s + d.amountMg, 0)
  const injectionCount = doses.length

  const doseTimestamps = doses.map(d => doseTimestamp(d)).sort((a, b) => a - b)
  const firstDoseMs = doseTimestamps[0]
  const lastDoseMs = doseTimestamps[doseTimestamps.length - 1]

  // Active window: first dose to 5 days (one half-life) after the last dose.
  // This excludes the long washout tail that would skew avg/zone metrics.
  const TAIL_DAYS = 5
  const windowEndMs = lastDoseMs + TAIL_DAYS * 24 * 3600 * 1000
  const activeCurve = curve.filter(p => p.timestamp >= firstDoseMs && p.timestamp <= windowEndMs)

  if (activeCurve.length === 0) {
    return { ...empty, totalDoseMg, injectionCount }
  }

  // Peak: max concentration in the active window
  let peak = 0
  let sum = 0
  for (const p of activeCurve) {
    if (p.concentration > peak) peak = p.concentration
    sum += p.concentration
  }
  const avg = sum / activeCurve.length

  // Trough: pre-dose concentration at the last dose (steady-state trough).
  // Find the curve point closest to (but not after) the last dose timestamp.
  let trough = 0
  if (doseTimestamps.length >= 2) {
    // Use the concentration just before the final dose
    const preDosePoints = activeCurve.filter(p => p.timestamp <= lastDoseMs && p.timestamp > firstDoseMs)
    if (preDosePoints.length > 0) {
      // Find the minimum among points at dose times (pre-dose troughs)
      const preDoseTroughs: number[] = []
      for (let i = 1; i < doseTimestamps.length; i++) {
        // Find curve point closest to this dose time (just before it)
        let closest: ConcentrationPoint | null = null
        for (const p of activeCurve) {
          if (p.timestamp <= doseTimestamps[i] && p.concentration > 0) {
            if (!closest || Math.abs(p.timestamp - doseTimestamps[i]) < Math.abs(closest.timestamp - doseTimestamps[i])) {
              closest = p
            }
          }
        }
        if (closest) preDoseTroughs.push(closest.concentration)
      }
      // Use the last pre-dose trough as the representative steady-state trough
      trough = preDoseTroughs.length > 0 ? preDoseTroughs[preDoseTroughs.length - 1] : 0
    }
  }

  const peakTroughRatio = trough > 0 ? peak / trough : 0

  // % time above threshold (within active window only)
  const threshold = peak * effectiveThresholdFraction
  const aboveThreshold = activeCurve.filter(p => p.concentration >= threshold).length
  const timeInEffectiveZonePct = (aboveThreshold / activeCurve.length) * 100

  // mg/week based on dosing span (first to last dose), not the full window
  const dosingSpanMs = lastDoseMs - firstDoseMs
  const dosingSpanWeeks = dosingSpanMs / (7 * 24 * 3600 * 1000)
  const avgMgPerWeek = dosingSpanWeeks > 0 ? totalDoseMg / dosingSpanWeeks : totalDoseMg

  return {
    peakConcentration: peak,
    troughConcentration: trough,
    averageConcentration: avg,
    peakTroughRatio,
    timeInEffectiveZonePct,
    totalDoseMg,
    injectionCount,
    avgMgPerWeek,
  }
}

/**
 * Adjust Vd for body weight using allometric scaling.
 * Reference: 10.3L at 70kg.
 */
export function adjustVdForWeight(
  weightKg: number,
  referenceWeightKg: number = 70,
  referenceVd: number = 10.3,
): number {
  // Simple linear scaling (the pop PK model uses a more complex fat-mass approach,
  // but linear is reasonable for a planning tool)
  return referenceVd * (weightKg / referenceWeightKg)
}

/**
 * Compute Tmax for a single dose (time to peak concentration).
 * Tmax = ln(ka/ke) / (ka - ke)
 */
export function computeTmax(params: PKParams): number {
  const ke = eliminationRate(params.halfLifeDays)
  const ka = params.absorptionRateKa
  if (Math.abs(ka - ke) < 1e-10) return 1 / ke
  return Math.log(ka / ke) / (ka - ke)
}

/**
 * dC/dt for a single dose at t hours after injection. Returns ng/mL per hour.
 *
 *   C(t)  = A * (e^(-ke*t) - e^(-ka*t))      A = (F*D*ka)/(Vd*(ka-ke))
 *   dC/dt = A * (ka*e^(-ka*t) - ke*e^(-ke*t))
 *
 * Limiting case ka ≈ ke:
 *   C(t)  = (F*D*ka/Vd) * t * e^(-ke*t)
 *   dC/dt = (F*D*ka/Vd) * e^(-ke*t) * (1 - ke*t)
 */
export function singleDoseSlope(
  doseMg: number,
  params: PKParams,
  tHours: number,
): number {
  if (tHours <= 0) return 0

  const ke = eliminationRate(params.halfLifeDays)
  const ka = params.absorptionRateKa
  const F = params.bioavailability
  const Vd = params.volumeOfDistL
  const D = doseMg * 1000 // mg → micrograms

  if (Math.abs(ka - ke) < 1e-10) {
    return (F * D * ka / Vd) * Math.exp(-ke * tHours) * (1 - ke * tHours)
  }

  const A = (F * D * ka) / (Vd * (ka - ke))
  return A * (ka * Math.exp(-ka * tHours) - ke * Math.exp(-ke * tHours))
}

/**
 * Total dC/dt at a given timestamp by summing per-dose slopes (superposition).
 * Same weight-resolution rules as concentrationAtTime. ng/mL per hour.
 */
export function slopeAtTime(
  doses: Dose[],
  params: PKParams,
  timestampMs: number,
  defaultWeightLbs?: number,
): number {
  const weights = resolveWeights(doses, defaultWeightLbs)
  let total = 0
  for (let i = 0; i < doses.length; i++) {
    const doseMs = doseTimestamp(doses[i])
    const tHours = (timestampMs - doseMs) / (1000 * 3600)
    if (tHours > 0) {
      const effectiveParams = weights[i]
        ? { ...params, volumeOfDistL: adjustVdForWeight(lbsToKg(weights[i]!), 70, params.volumeOfDistL) }
        : params
      total += singleDoseSlope(doses[i].amountMg, effectiveParams, tHours)
    }
  }
  return total
}
