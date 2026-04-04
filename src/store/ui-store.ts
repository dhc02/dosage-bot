import { create } from 'zustand'

interface UIStore {
  selectedPlanId: string | null;
  setSelectedPlanId: (id: string | null) => void;

  showQuickSchedule: boolean;
  setShowQuickSchedule: (show: boolean) => void;

  chartResolutionHours: number;
  setChartResolutionHours: (hours: number) => void;

  hiddenPlanIds: string[];
  togglePlanVisibility: (planId: string) => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  selectedPlanId: null,
  setSelectedPlanId: (id) => set({ selectedPlanId: id }),

  showQuickSchedule: false,
  setShowQuickSchedule: (show) => set({ showQuickSchedule: show }),

  chartResolutionHours: 2,
  setChartResolutionHours: (hours) => set({ chartResolutionHours: hours }),

  hiddenPlanIds: [],
  togglePlanVisibility: (planId) => set(state => ({
    hiddenPlanIds: state.hiddenPlanIds.includes(planId)
      ? state.hiddenPlanIds.filter(id => id !== planId)
      : [...state.hiddenPlanIds, planId],
  })),
}))
