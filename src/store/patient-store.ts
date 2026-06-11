import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { PatientData, Plan, Dose, PlanType, PKParams, ExperienceLog } from '../types'
import { DEFAULT_PK_PARAMS } from '../types'
import { generateStandardTitration } from '../lib/standard-schedules'
import * as api from '../lib/api'

const PLAN_COLORS: Record<PlanType, string> = {
  baseline: '#3b82f6',
  experiment: '#f59e0b',
  actual: '#10b981',
}

const MAX_UNDO_STACK = 50

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

// Deep clone via JSON — fast enough for our data sizes
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// Debounced save to API
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

  // Undo/redo stacks (not persisted, memory-only)
  undoStack: PatientData[];
  redoStack: PatientData[];

  // Lifecycle
  loadFromServer: () => Promise<void>;

  // Derived
  getActivePatient: () => PatientData | undefined;
  getActivePlan: (type: PlanType) => Plan | undefined;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  hasUndo: () => boolean;
  hasRedo: () => boolean;

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

  // Experience logs
  addExperienceLog: (log: Omit<ExperienceLog, 'id'>) => void;
  removeExperienceLog: (logId: string) => void;
  getExperienceLogs: () => ExperienceLog[];
}

export const usePatientStore = create<PatientStore>()(
  persist(
    (set, get) => {
      function pushUndoSnapshot() {
        const { activePatientId, patients } = get()
        if (!activePatientId) return
        const active = patients.find(p => p.patient.id === activePatientId)
        if (!active) return
        const snapshot = clone(active)

        set(state => {
          const stack = [...state.undoStack, snapshot]
          if (stack.length > MAX_UNDO_STACK) stack.shift()
          return { undoStack: stack, redoStack: [] }
        })
      }

      function updateActivePatient(updater: (pd: PatientData) => PatientData, skipUndo = false) {
        const { activePatientId, patients } = get()
        if (!activePatientId) return

        if (!skipUndo) pushUndoSnapshot()

        const newPatients = patients.map(p =>
          p.patient.id === activePatientId ? updater(p) : p
        )
        set({ patients: newPatients })

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
        undoStack: [],
        redoStack: [],

        undo() {
          const { undoStack, patients, activePatientId } = get()
          if (undoStack.length === 0 || !activePatientId) return

          const previous = undoStack[undoStack.length - 1]
          const newStack = undoStack.slice(0, -1)

          // Push current state to redo
          const current = patients.find(p => p.patient.id === activePatientId)
          const redoEntry = current ? clone(current) : null

          const newPatients = patients.map(p =>
            p.patient.id === activePatientId ? clone(previous) : p
          )

          const newRedo = redoEntry
            ? [...get().redoStack, redoEntry]
            : get().redoStack

          set({ patients: newPatients, undoStack: newStack, redoStack: newRedo })

          // Save the restored state
          const restored = newPatients.find(p => p.patient.id === activePatientId)
          if (restored) debouncedSavePatient(restored)
        },

        redo() {
          const { redoStack, patients, activePatientId } = get()
          if (redoStack.length === 0 || !activePatientId) return

          const next = redoStack[redoStack.length - 1]
          const newRedo = redoStack.slice(0, -1)

          // Push current state to undo
          const current = patients.find(p => p.patient.id === activePatientId)
          if (current) {
            const snapshot = clone(current)
            const newUndo = [...get().undoStack, snapshot]
            set({ undoStack: newUndo })
          }

          const newPatients = patients.map(p =>
            p.patient.id === activePatientId ? clone(next) : p
          )

          set({ patients: newPatients, redoStack: newRedo })

          const restored = newPatients.find(p => p.patient.id === activePatientId)
          if (restored) debouncedSavePatient(restored)
        },

        hasUndo() {
          return get().undoStack.length > 0
        },

        hasRedo() {
          return get().redoStack.length > 0
        },

        async loadFromServer() {
          try {
            const list = await api.fetchPatientList()
            if (list.length === 0) {
              const defaultPd = createDefaultPatient()
              await api.savePatientData(defaultPd)
              set({ patients: [defaultPd], activePatientId: defaultPd.patient.id, loaded: true, undoStack: [], redoStack: [] })
              return
            }

            const allData = await Promise.all(list.map(p => api.fetchPatientData(p.id)))
            const current = get()
            set({
              patients: allData,
              activePatientId: current.activePatientId && allData.some(p => p.patient.id === current.activePatientId)
                ? current.activePatientId
                : allData[0].patient.id,
              loaded: true,
              undoStack: [],
              redoStack: [],
            })
          } catch {
            console.warn('API server unavailable, using localStorage data')
            const current = get()
            if (current.patients.length === 0) {
              const defaultPd = createDefaultPatient()
              set({ patients: [defaultPd], activePatientId: defaultPd.patient.id, loaded: true, undoStack: [], redoStack: [] })
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
            undoStack: [],
            redoStack: [],
          }))
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
              undoStack: [],
              redoStack: [],
            }
          })
          api.deletePatientData(id).catch(err => {
            console.warn('Failed to delete patient from server:', err)
          })
        },

        renamePatient(id: string, name: string) {
          pushUndoSnapshot()
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
          set({ activePatientId: id, undoStack: [], redoStack: [] })
        },

        updatePatientWeight(id: string, weightKg: number | undefined) {
          pushUndoSnapshot()
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

        addExperienceLog(log: Omit<ExperienceLog, 'id'>) {
          const newLog: ExperienceLog = { ...log, id: nanoid() }
          updateActivePatient(pd => ({
            ...pd,
            experienceLogs: [...(pd.experienceLogs ?? []), newLog],
          }))
        },

        removeExperienceLog(logId: string) {
          updateActivePatient(pd => ({
            ...pd,
            experienceLogs: (pd.experienceLogs ?? []).filter(l => l.id !== logId),
          }))
        },

        getExperienceLogs() {
          const pd = get().getActivePatient()
          if (!pd) return []
          return [...(pd.experienceLogs ?? [])].sort((a, b) => b.timestamp - a.timestamp)
        },
      }
    },
    {
      name: 'tirzepatide-scheduler-storage',
      partialize: (state) => {
        // Don't persist undo/redo stacks
        const { undoStack, redoStack, ...rest } = state
        return rest
      },
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
usePatientStore.getState().loadFromServer()
