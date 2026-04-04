import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { PatientData, Plan, Dose, PlanType, PKParams } from '../types'
import { DEFAULT_PK_PARAMS } from '../types'
import { generateStandardTitration } from '../lib/standard-schedules'
import * as api from '../lib/api'

const PLAN_COLORS: Record<PlanType, string> = {
  baseline: '#3b82f6',
  experiment: '#f59e0b',
  actual: '#10b981',
}

function createDefaultPatient(): PatientData {
  const patientId = nanoid()
  const baselinePlan: Plan = {
    id: nanoid(),
    name: 'FDA Standard Titration',
    type: 'baseline',
    doses: generateStandardTitration(new Date()),
    pkParams: { ...DEFAULT_PK_PARAMS },
    createdAt: new Date().toISOString(),
    color: PLAN_COLORS.baseline,
  }

  return {
    patient: {
      id: patientId,
      name: 'Patient 1',
      createdAt: new Date().toISOString(),
    },
    plans: [baselinePlan],
    activePlanIds: {
      baseline: baselinePlan.id,
      experiment: null,
      actual: null,
    },
  }
}

// Debounced save to API — saves the specific patient that changed
let saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedSavePatient(patientData: PatientData) {
  const id = patientData.patient.id
  if (saveTimers[id]) clearTimeout(saveTimers[id])
  saveTimers[id] = setTimeout(() => {
    api.savePatientData(patientData).catch(err => {
      console.warn('Failed to save patient to server:', err)
    })
  }, 500)
}

interface PatientStore {
  patients: PatientData[];
  activePatientId: string | null;
  loaded: boolean;

  // Lifecycle
  loadFromServer: () => Promise<void>;

  // Derived
  getActivePatient: () => PatientData | undefined;
  getActivePlan: (type: PlanType) => Plan | undefined;

  // Patient CRUD
  addPatient: (name: string) => void;
  removePatient: (id: string) => void;
  renamePatient: (id: string, name: string) => void;
  setActivePatient: (id: string) => void;
  updatePatientWeight: (id: string, weightKg: number | undefined) => void;

  // Plan CRUD
  addPlan: (type: PlanType, name: string, doses?: Dose[]) => string;
  removePlan: (planId: string) => void;
  renamePlan: (planId: string, name: string) => void;
  setActivePlan: (type: PlanType, planId: string | null) => void;
  clonePlan: (planId: string, newType: PlanType, newName: string) => string;
  updatePlanParams: (planId: string, params: Partial<PKParams>) => void;
  updatePlanStartingWeight: (planId: string, weightLbs: number | undefined) => void;

  // Dose CRUD
  addDose: (planId: string, dose: Omit<Dose, 'id'>) => void;
  updateDose: (planId: string, doseId: string, updates: Partial<Omit<Dose, 'id'>>) => void;
  removeDose: (planId: string, doseId: string) => void;
  setDoses: (planId: string, doses: Dose[]) => void;
}

export const usePatientStore = create<PatientStore>()(
  persist(
    (set, get) => {
      function updateActivePatient(updater: (pd: PatientData) => PatientData) {
        const { activePatientId, patients } = get()
        if (!activePatientId) return
        const newPatients = patients.map(p =>
          p.patient.id === activePatientId ? updater(p) : p
        )
        set({ patients: newPatients })

        // Save changed patient to server
        const changed = newPatients.find(p => p.patient.id === activePatientId)
        if (changed) debouncedSavePatient(changed)
      }

      function findPlanInActive(planId: string): Plan | undefined {
        const pd = get().getActivePatient()
        return pd?.plans.find(p => p.id === planId)
      }

      return {
        patients: [],
        activePatientId: null,
        loaded: false,

        async loadFromServer() {
          try {
            const list = await api.fetchPatientList()
            if (list.length === 0) {
              // No patients on server — create default and save it
              const defaultPd = createDefaultPatient()
              await api.savePatientData(defaultPd)
              set({ patients: [defaultPd], activePatientId: defaultPd.patient.id, loaded: true })
              return
            }

            // Load full data for all patients
            const allData = await Promise.all(list.map(p => api.fetchPatientData(p.id)))
            const current = get()
            set({
              patients: allData,
              activePatientId: current.activePatientId && allData.some(p => p.patient.id === current.activePatientId)
                ? current.activePatientId
                : allData[0].patient.id,
              loaded: true,
            })
          } catch {
            // Server unavailable — fall back to localStorage data (already loaded by persist)
            console.warn('API server unavailable, using localStorage data')
            const current = get()
            if (current.patients.length === 0) {
              const defaultPd = createDefaultPatient()
              set({ patients: [defaultPd], activePatientId: defaultPd.patient.id, loaded: true })
            } else {
              set({ loaded: true })
            }
          }
        },

        getActivePatient() {
          const { patients, activePatientId } = get()
          if (!activePatientId && patients.length > 0) {
            return patients[0]
          }
          return patients.find(p => p.patient.id === activePatientId)
        },

        getActivePlan(type: PlanType) {
          const pd = get().getActivePatient()
          if (!pd) return undefined
          const planId = pd.activePlanIds[type]
          if (!planId) return undefined
          return pd.plans.find(p => p.id === planId)
        },

        addPatient(name: string) {
          const newPatient = createDefaultPatient()
          newPatient.patient.name = name
          set(state => ({
            patients: [...state.patients, newPatient],
            activePatientId: newPatient.patient.id,
          }))
          // Save new patient to server
          debouncedSavePatient(newPatient)
        },

        removePatient(id: string) {
          set(state => {
            const filtered = state.patients.filter(p => p.patient.id !== id)
            return {
              patients: filtered,
              activePatientId: state.activePatientId === id
                ? (filtered[0]?.patient.id ?? null)
                : state.activePatientId,
            }
          })
          api.deletePatientData(id).catch(err => {
            console.warn('Failed to delete patient from server:', err)
          })
        },

        renamePatient(id: string, name: string) {
          const newPatients = get().patients.map(p =>
            p.patient.id === id
              ? { ...p, patient: { ...p.patient, name } }
              : p
          )
          set({ patients: newPatients })
          const changed = newPatients.find(p => p.patient.id === id)
          if (changed) debouncedSavePatient(changed)
        },

        setActivePatient(id: string) {
          set({ activePatientId: id })
        },

        updatePatientWeight(id: string, weightKg: number | undefined) {
          const newPatients = get().patients.map(p =>
            p.patient.id === id
              ? { ...p, patient: { ...p.patient, weightKg } }
              : p
          )
          set({ patients: newPatients })
          const changed = newPatients.find(p => p.patient.id === id)
          if (changed) debouncedSavePatient(changed)
        },

        addPlan(type: PlanType, name: string, doses?: Dose[]) {
          const planId = nanoid()
          const plan: Plan = {
            id: planId,
            name,
            type,
            doses: doses ?? [],
            pkParams: { ...DEFAULT_PK_PARAMS },
            createdAt: new Date().toISOString(),
            color: PLAN_COLORS[type],
          }
          updateActivePatient(pd => ({
            ...pd,
            plans: [...pd.plans, plan],
            activePlanIds: { ...pd.activePlanIds, [type]: planId },
          }))
          return planId
        },

        removePlan(planId: string) {
          updateActivePatient(pd => {
            const plan = pd.plans.find(p => p.id === planId)
            const newActivePlanIds = { ...pd.activePlanIds }
            if (plan && newActivePlanIds[plan.type] === planId) {
              newActivePlanIds[plan.type] = null
            }
            return {
              ...pd,
              plans: pd.plans.filter(p => p.id !== planId),
              activePlanIds: newActivePlanIds,
            }
          })
        },

        renamePlan(planId: string, name: string) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId ? { ...p, name } : p
            ),
          }))
        },

        setActivePlan(type: PlanType, planId: string | null) {
          updateActivePatient(pd => ({
            ...pd,
            activePlanIds: { ...pd.activePlanIds, [type]: planId },
          }))
        },

        clonePlan(planId: string, newType: PlanType, newName: string) {
          const source = findPlanInActive(planId)
          if (!source) return ''
          const newId = nanoid()
          const cloned: Plan = {
            ...source,
            id: newId,
            name: newName,
            type: newType,
            color: PLAN_COLORS[newType],
            doses: source.doses.map(d => ({ ...d, id: nanoid() })),
            createdAt: new Date().toISOString(),
          }
          updateActivePatient(pd => ({
            ...pd,
            plans: [...pd.plans, cloned],
            activePlanIds: { ...pd.activePlanIds, [newType]: newId },
          }))
          return newId
        },

        updatePlanParams(planId: string, params: Partial<PKParams>) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId
                ? { ...p, pkParams: { ...p.pkParams, ...params } }
                : p
            ),
          }))
        },

        updatePlanStartingWeight(planId: string, weightLbs: number | undefined) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId
                ? { ...p, startingWeightLbs: weightLbs }
                : p
            ),
          }))
        },

        addDose(planId: string, dose: Omit<Dose, 'id'>) {
          const newDose: Dose = { ...dose, id: nanoid() }
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId
                ? { ...p, doses: [...p.doses, newDose] }
                : p
            ),
          }))
        },

        updateDose(planId: string, doseId: string, updates: Partial<Omit<Dose, 'id'>>) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId
                ? {
                    ...p,
                    doses: p.doses.map(d =>
                      d.id === doseId ? { ...d, ...updates } : d
                    ),
                  }
                : p
            ),
          }))
        },

        removeDose(planId: string, doseId: string) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId
                ? { ...p, doses: p.doses.filter(d => d.id !== doseId) }
                : p
            ),
          }))
        },

        setDoses(planId: string, doses: Dose[]) {
          updateActivePatient(pd => ({
            ...pd,
            plans: pd.plans.map(p =>
              p.id === planId ? { ...p, doses } : p
            ),
          }))
        },
      }
    },
    {
      name: 'tirzepatide-scheduler-storage',
    },
  ),
)

// Initialize: first hydrate from localStorage (automatic), then load from server
const initialState = usePatientStore.getState()
if (initialState.patients.length === 0) {
  const defaultPd = createDefaultPatient()
  usePatientStore.setState({
    patients: [defaultPd],
    activePatientId: defaultPd.patient.id,
  })
}
// Kick off server load
usePatientStore.getState().loadFromServer()
