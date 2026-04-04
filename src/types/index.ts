export interface Patient {
  id: string;
  name: string;
  createdAt: string;
  weightKg?: number;
  notes?: string;
}

export interface PKParams {
  halfLifeDays: number;
  bioavailability: number;
  volumeOfDistL: number;
  absorptionRateKa: number; // per hour
}

export const DEFAULT_PK_PARAMS: PKParams = {
  halfLifeDays: 5,
  bioavailability: 0.80,
  volumeOfDistL: 10.3,
  absorptionRateKa: 0.0373,
};

export interface Dose {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  amountMg: number;
  note?: string;
  weightLbs?: number; // patient weight at time of dose (overrides plan default)
}

export type PlanType = 'baseline' | 'experiment' | 'actual';

export interface Plan {
  id: string;
  name: string;
  type: PlanType;
  doses: Dose[];
  pkParams: PKParams;
  startingWeightLbs?: number; // default weight for all doses unless overridden per-dose
  createdAt: string;
  color: string;
}

// Conversion helpers
export const LBS_PER_KG = 2.20462;
export function lbsToKg(lbs: number): number { return lbs / LBS_PER_KG; }
export function kgToLbs(kg: number): number { return kg * LBS_PER_KG; }

export interface ActivePlanIds {
  baseline: string | null;
  experiment: string | null;
  actual: string | null;
}

export interface PatientData {
  patient: Patient;
  plans: Plan[];
  activePlanIds: ActivePlanIds;
}

export interface ConcentrationPoint {
  timestamp: number;      // epoch ms
  hours: number;          // hours from start
  concentration: number;  // ng/mL
}

export interface PlanMetrics {
  peakConcentration: number;
  troughConcentration: number;
  averageConcentration: number;
  peakTroughRatio: number;
  timeInEffectiveZonePct: number;
  totalDoseMg: number;
  injectionCount: number;
  avgMgPerWeek: number;
}

export interface ComputedPlan {
  plan: Plan;
  curve: ConcentrationPoint[];
  metrics: PlanMetrics;
}
