import { create } from 'zustand'

export type ViewMode = 'auto' | 'mobile' | 'desktop';
export type MobileTab = 'dashboard' | 'chart' | 'logs';
export type DoseEntryStep = 'enter' | 'preview';

interface UIStore {
  selectedPlanId: string | null;
  setSelectedPlanId: (id: string | null) => void;

  showQuickSchedule: boolean;
  setShowQuickSchedule: (show: boolean) => void;

  chartResolutionHours: number;
  setChartResolutionHours: (hours: number) => void;

  hiddenPlanIds: string[];
  togglePlanVisibility: (planId: string) => void;

  // View mode (mobile vs desktop)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Mobile tab navigation
  mobileActiveTab: MobileTab;
  setMobileActiveTab: (tab: MobileTab) => void;

  // Experience log modal
  showExperienceLogForm: boolean;
  setShowExperienceLogForm: (show: boolean) => void;

  // Mobile dose entry flow
  showDoseEntry: boolean;
  doseEntryStep: DoseEntryStep;
  setShowDoseEntry: (show: boolean) => void;
  setDoseEntryStep: (step: DoseEntryStep) => void;
  openDoseEntry: () => void;
  closeDoseEntry: () => void;
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

  viewMode: 'auto',
  setViewMode: (mode) => set({ viewMode: mode }),

  mobileActiveTab: 'dashboard',
  setMobileActiveTab: (tab) => set({ mobileActiveTab: tab }),

  showExperienceLogForm: false,
  setShowExperienceLogForm: (show) => set({ showExperienceLogForm: show }),

  showDoseEntry: false,
  doseEntryStep: 'enter',
  setShowDoseEntry: (show) => set({ showDoseEntry: show }),
  setDoseEntryStep: (step) => set({ doseEntryStep: step }),
  openDoseEntry: () => set({ showDoseEntry: true, doseEntryStep: 'enter' }),
  closeDoseEntry: () => set({ showDoseEntry: false, doseEntryStep: 'enter' }),
}))
