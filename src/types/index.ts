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

export type InjectionSite = 'belly' | 'thigh' | 'arm' | 'other';

export const INJECTION_SITES: InjectionSite[] = ['belly', 'thigh', 'arm', 'other'];

export const INJECTION_SITE_LABELS: Record<InjectionSite, string> = {
  belly: 'Belly',
  thigh: 'Thigh',
  arm: 'Arm',
  other: 'Other',
};

export interface Dose {
  id: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  amountMg: number;
  injectionSite?: InjectionSite;
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
  experienceLogs?: ExperienceLog[];
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

export type MentalState = 'focused' | 'foggy' | 'anxious' | 'calm' | 'normal' | 'irritable' | 'low';

export const MENTAL_STATES: MentalState[] = ['focused', 'calm', 'normal', 'foggy', 'low', 'anxious', 'irritable'];

export interface ExperienceLog {
  id: string;
  timestamp: number;
  mentalState: MentalState;
  hungerLevel: number;        // 1-10
  energyLevel: number;        // 1-10
  notes?: string;
  serumConcentration?: number;       // ng/mL snapshot
  slopeNgPerMlPerHour?: number;      // signed snapshot
  hoursSinceLastDose?: number;
  hoursUntilPeak?: number;           // set when on upslope (slope > 0)
  hoursSincePeak?: number;           // set when on downslope (slope < 0)
}
