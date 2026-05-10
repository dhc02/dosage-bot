import { useMemo } from 'react'
import type { Dose, Plan } from '../types'
import {
  concentrationAtTime,
  computeConcentrationCurve,
  slopeAtTime,
} from '../lib/pk-engine'

export interface PendingDose {
  date: string;
  time: string;
  amountMg: number;
}

export interface DosePreviewCurvePoint {
  timestamp: number;
  baseline: number;  // concentration without the pending dose
  withDose: number;  // concentration including the pending dose
}

export interface DosePreviewResult {
  doseTimestampMs: number;
  concentrationBefore: number;     // serum at dose time without pending dose
  slopeBeforePerHour: number;
  concentrationAfter24h: number;   // serum 24 h after dose with pending dose
  peakAfter: number;               // max concentration in preview window with pending dose
  slopeAfterPerHour: number;       // slope at 6 h after dose with pending dose
  curve: DosePreviewCurvePoint[];
  rangeStart: number;
  rangeEnd: number;
}

const DAY_MS = 24 * 3600 * 1000

/**
 * Compute preview metrics + a comparison curve for a pending dose against
 * the existing actual plan, without mutating any store state.
 *
 * Window: 7 days before the pending dose → 14 days after.
 * Resolution: 4 h (keeps the preview chart cheap on mobile).
 */
export function useDosePreview(
  actualPlan: Plan | undefined,
  pending: PendingDose | null,
): DosePreviewResult | null {
  return useMemo(() => {
    if (!pending || !pending.date || !pending.time || pending.amountMg <= 0) return null

    const doseTsMs = new Date(`${pending.date}T${pending.time}:00`).getTime()
    if (!Number.isFinite(doseTsMs)) return null

    // Synthesize the candidate dose with a deterministic id so curve math sees it.
    const candidateDose: Dose = {
      id: '__preview__',
      date: pending.date,
      time: pending.time,
      amountMg: pending.amountMg,
    }

    const existingDoses: Dose[] = actualPlan?.doses ?? []
    const params = actualPlan?.pkParams ?? {
      halfLifeDays: 5,
      bioavailability: 0.80,
      volumeOfDistL: 10.3,
      absorptionRateKa: 0.0373,
    }
    const startingWeightLbs = actualPlan?.startingWeightLbs
    const withDoseDoses = [...existingDoses, candidateDose]

    const rangeStart = doseTsMs - 7 * DAY_MS
    const rangeEnd = doseTsMs + 14 * DAY_MS

    const baselineCurve = computeConcentrationCurve(
      existingDoses,
      params,
      new Date(rangeStart),
      new Date(rangeEnd),
      4,
      startingWeightLbs,
    )
    const withDoseCurve = computeConcentrationCurve(
      withDoseDoses,
      params,
      new Date(rangeStart),
      new Date(rangeEnd),
      4,
      startingWeightLbs,
    )

    const curve: DosePreviewCurvePoint[] = baselineCurve.map((p, i) => ({
      timestamp: p.timestamp,
      baseline: p.concentration,
      withDose: withDoseCurve[i]?.concentration ?? p.concentration,
    }))

    const concentrationBefore = concentrationAtTime(existingDoses, params, doseTsMs, startingWeightLbs)
    const slopeBeforePerHour = slopeAtTime(existingDoses, params, doseTsMs, startingWeightLbs)
    const concentrationAfter24h = concentrationAtTime(withDoseDoses, params, doseTsMs + DAY_MS, startingWeightLbs)
    const slopeAfterPerHour = slopeAtTime(withDoseDoses, params, doseTsMs + 6 * 3600 * 1000, startingWeightLbs)

    let peakAfter = 0
    for (const p of withDoseCurve) {
      if (p.timestamp >= doseTsMs && p.concentration > peakAfter) {
        peakAfter = p.concentration
      }
    }

    return {
      doseTimestampMs: doseTsMs,
      concentrationBefore,
      slopeBeforePerHour,
      concentrationAfter24h,
      peakAfter,
      slopeAfterPerHour,
      curve,
      rangeStart,
      rangeEnd,
    }
  }, [actualPlan, pending])
}
