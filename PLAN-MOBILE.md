# Mobile Dashboard + Subjective Experience Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first dashboard (current serum level, slope, baseline comparison) plus a quick subjective-experience logging flow, while keeping the existing desktop comparison view intact and reachable.

**Architecture:** Introduce a top-level mobile vs. desktop branch in `App.tsx`, gated by a `useIsMobile()` hook with manual override stored in `ui-store`. The mobile shell uses a 3-tab bottom nav (Dashboard / Chart / Logs) and reuses the existing `pk-engine` and Zustand stores — no duplicated state. Subjective logs live inside `PatientData.experienceLogs` so they piggy-back on the existing debounced save flow; no new server endpoints are needed.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind CSS 4, Recharts, Zustand, date-fns, Vitest, Express. No new runtime dependencies.

---

## 1. Architecture Decisions

### 1.1 Mobile vs. desktop view selection

- **Single React tree, branched at root.** `App.tsx` reads `viewMode` from `ui-store`. If `viewMode === 'mobile'` (or `'auto'` and viewport ≤ 767px), render `<MobileApp />`. Otherwise render the existing `<Header /> <Sidebar /> <MainContent />` layout.
- **Why not `react-router`?** The project has no router today, only two top-level layouts, and adding routes for two views is overkill. A `viewMode` selector is enough.
- **Why not pure CSS?** The desktop layout includes `Sidebar` (w-64) and a wide `MetricsPanel` grid (`grid-cols-4`) that don't compress gracefully. Branching at the root is simpler than re-flowing every component.
- **Manual override.** A toggle button in the header (visible on both layouts) lets the user force `'desktop'`, `'mobile'`, or `'auto'`. This satisfies "the existing desktop comparison view should still be accessible" on phones, and lets desktop users preview the mobile layout for testing.

### 1.2 "Current" time

- A `useNow()` hook returns `Date.now()` and ticks every 60 seconds via `setInterval`. All "current" computations (`concentrationAtTime(now)`, slope, etc.) memoize on `now` so the dashboard auto-refreshes without page reload.

### 1.3 Slope computation — analytical, not numerical

We have a closed-form `C(t)`, so the derivative is also closed-form. Analytical is exact, fast, and lives next to `singleDoseConcentration`:

```
C(t)  = A * (e^(-ke*t) - e^(-ka*t))       where A = (F*D*ka) / (Vd*(ka-ke))
dC/dt = A * (ka*e^(-ka*t) - ke*e^(-ke*t))
```

Limiting case (ka ≈ ke):

```
C(t)  = (F*D*ka/Vd) * t * e^(-ke*t)
dC/dt = (F*D*ka/Vd) * e^(-ke*t) * (1 - ke*t)
```

Multi-dose: superposition holds for derivatives — sum the per-dose slopes. The engine returns ng/mL **per hour**; UI multiplies by 24 to display ng/mL/day.

### 1.4 FDA / baseline comparison

The user's "FDA comparison" means: compare the patient's current actual concentration against the active **baseline** plan's steady-state peak / trough / average (already computed by `computeMetrics`). UI label: "vs Baseline" (the baseline plan defaults to FDA standard titration but the user can rename/edit it). If no baseline is active, the comparison card is hidden.

### 1.5 Experience logs — embedded vs. separate endpoints

**Embed in `PatientData.experienceLogs`.** Reasoning:

- Logs are tightly bound to a patient and small (~100 bytes each).
- Existing 500 ms debounced save already batches writes — adding a log just dirties `PatientData` and the same save fires.
- No new endpoints, no new files server-side.
- Trade-off: writing a single log re-serializes the whole patient JSON. For an educational/personal-use tool with O(1000) logs/year, this is fine. If this changes, migrate to `GET/POST /api/patients/:id/experiences` later — that migration is straightforward because the data model already keys logs by patient id.

### 1.6 Snapshot derived PK values at log time

When the user submits a log, we compute and store the actual plan's serum concentration and slope **at the log timestamp** as part of the log entry. This makes future correlation analysis trivial (no need to recompute curves over historical doses) and freezes the snapshot against later edits to dose history.

---

## 2. Data Model Changes

All edits are in `src/types/index.ts`.

```typescript
// New: subjective experience entry
export type MentalState = 'focused' | 'foggy' | 'anxious' | 'calm' | 'normal' | 'irritable' | 'low';

export interface ExperienceLog {
  id: string;
  timestamp: number;          // epoch ms when the user submitted the log
  mentalState: MentalState;
  hungerLevel: number;        // 1-10
  energyLevel: number;        // 1-10
  notes?: string;

  // PK snapshot at log time — derived from the patient's active 'actual' plan.
  // Frozen at log creation so later dose edits don't shift correlations.
  serumConcentration?: number;       // ng/mL, undefined if no actual plan
  slopeNgPerMlPerHour?: number;      // signed; undefined if no actual plan
  hoursSinceLastDose?: number;       // undefined if no doses recorded yet
}

// Extend the existing PatientData shape
export interface PatientData {
  patient: Patient;
  plans: Plan[];
  activePlanIds: ActivePlanIds;
  experienceLogs?: ExperienceLog[];   // optional for backward-compat with existing JSON files
}
```

**Migration:** `experienceLogs` is optional. All read sites must use `pd.experienceLogs ?? []`. No explicit migration script needed; the field gets populated on the next save.

---

## 3. Component Tree

```
App
├── (viewMode === 'mobile') MobileApp
│   ├── MobileHeader              (compact: title + patient picker + view toggle)
│   ├── (active tab content)
│   │   ├── MobileDashboard       (default tab)
│   │   │   ├── CurrentLevelCard
│   │   │   ├── SlopeIndicator
│   │   │   ├── BaselineComparison
│   │   │   └── LogExperienceButton  → opens ExperienceLogForm modal
│   │   ├── MobileChartView
│   │   │   └── ConcentrationChart  (existing, unchanged)
│   │   └── MobileLogsView
│   │       ├── ExperienceLogList
│   │       └── (FAB) "+" → opens ExperienceLogForm
│   ├── MobileBottomNav           (Dashboard / Chart / Logs)
│   └── ExperienceLogForm         (modal, controlled by ui-store)
│
└── (viewMode === 'desktop') Existing tree
    ├── Header                    (with new ViewModeToggle)
    ├── Sidebar
    └── MainContent → ComparisonView (unchanged)
```

### Component prop contracts

```typescript
// CurrentLevelCard
interface Props {
  concentration: number;       // ng/mL at "now"
  hasActualPlan: boolean;
}

// SlopeIndicator
interface Props {
  slopeNgPerMlPerHour: number; // signed
}

// BaselineComparison
interface Props {
  currentNgMl: number;
  baselinePeak: number;
  baselineTrough: number;
  baselineAverage: number;
}

// ExperienceLogForm
interface Props {
  open: boolean;
  onClose: () => void;
  // Reads active patient + computes snapshot internally on submit
}

// ExperienceLogList
interface Props {
  logs: ExperienceLog[];       // sorted desc by timestamp
  onDelete: (id: string) => void;
}

// MobileBottomNav
interface Props {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

// ViewModeToggle
// (no props; reads/writes ui-store directly)
```

---

## 4. Route / Layout Strategy

- **No router added.** Mobile tab state is `mobileActiveTab: 'dashboard' | 'chart' | 'logs'` in `ui-store` (transient, not persisted — fresh tab on reload).
- **View mode source-of-truth:** `ui-store.viewMode: 'auto' | 'mobile' | 'desktop'`.
- **Resolution:** A new `useIsMobile()` hook returns `boolean` based on `window.matchMedia('(max-width: 767px)')` and listens for changes. `App.tsx` resolves: `effectiveMode = viewMode === 'auto' ? (isMobile ? 'mobile' : 'desktop') : viewMode`.
- **Breakpoint:** Tailwind's default `md:` boundary (768 px). `< 768 px → mobile`, `≥ 768 px → desktop`.
- **Touch targets:** All interactive elements on mobile screens use `min-h-11` (44 px) at minimum. Buttons in bottom nav are `h-14`.
- **Bottom nav layout:** fixed `bottom-0 left-0 right-0`, 3 equal-width buttons, icon + label. Add `pb-[env(safe-area-inset-bottom)]` for iOS home-indicator clearance.
- **Safe-area for top notch:** `MobileHeader` uses `pt-[env(safe-area-inset-top)]`.

---

## 5. Slope Computation — Concrete API

New exports in `src/lib/pk-engine.ts`:

```typescript
/** Slope contribution from one dose at t hours after injection. ng/mL per hour. */
export function singleDoseSlope(doseMg: number, params: PKParams, tHours: number): number;

/** Total dC/dt at a given timestamp by superposition. ng/mL per hour. */
export function slopeAtTime(
  doses: Dose[],
  params: PKParams,
  timestampMs: number,
  defaultWeightLbs?: number,
): number;
```

Reuses `eliminationRate`, `doseTimestamp`, `resolveWeights`, `adjustVdForWeight`, `lbsToKg` — same weight-resolution path as `concentrationAtTime` so per-dose Vd adjustments cascade identically.

UI conversion:
```typescript
const slopePerDay = slopeNgPerMlPerHour * 24
```

---

## 6. State Management

### `ui-store.ts` additions

```typescript
type ViewMode = 'auto' | 'mobile' | 'desktop';
type MobileTab = 'dashboard' | 'chart' | 'logs';

interface UIStore {
  // ... existing fields ...
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  mobileActiveTab: MobileTab;
  setMobileActiveTab: (tab: MobileTab) => void;

  showExperienceLogForm: boolean;
  setShowExperienceLogForm: (show: boolean) => void;
}
```

Initial values: `viewMode: 'auto'`, `mobileActiveTab: 'dashboard'`, `showExperienceLogForm: false`. Note: `ui-store` is **not** persisted today — keep it that way. We want the user to land on the dashboard each session.

### `patient-store.ts` additions

```typescript
interface PatientStore {
  // ... existing methods ...
  addExperienceLog: (log: Omit<ExperienceLog, 'id'>) => void;
  removeExperienceLog: (logId: string) => void;
  getExperienceLogs: () => ExperienceLog[];   // sorted desc by timestamp
}
```

All three operate on the active patient and use the existing `updateActivePatient` helper, which already triggers `debouncedSavePatient`. No new persistence code.

### New hooks

- `src/hooks/useNow.ts` — `useNow(intervalMs = 60_000): number` — returns `Date.now()` and re-renders every `intervalMs` ms.
- `src/hooks/useIsMobile.ts` — `useIsMobile(maxWidthPx = 767): boolean` — `matchMedia` with change listener.

---

## 7. API Changes

**No new endpoints.** The existing PUT `/api/patients/:id` already round-trips the entire `PatientData` JSON, so the new `experienceLogs` field is persisted automatically once the type is extended and the store writes it.

The only server-side check that could matter is the request size (currently `express.json({ limit: '5mb' })` — `server/index.ts:11`). 5 MB easily holds tens of thousands of logs; no change needed.

---

## 8. Testing Strategy

| Layer | What to test | How |
|---|---|---|
| `pk-engine` slope | Slope at t=0 = F·D·ka/Vd; slope at Tmax ≈ 0; slope < 0 well past Tmax; slope ≈ 0 at large t; superposition equals sum of per-dose slopes; ka≈ke limiting branch | Vitest unit tests in `pk-engine.test.ts` |
| `patient-store` logs | `addExperienceLog` appends; `removeExperienceLog` removes; `getExperienceLogs` returns desc-sorted | New `patient-store.test.ts` |
| `useIsMobile` | Returns true under 767 px, updates on resize | Skipped — trivial wrapper around `matchMedia` |
| `useNow` | Skipped — trivial setInterval wrapper |
| Components | `ExperienceLogForm` submits with valid data; `BaselineComparison` renders correct marker positions | Optional — testing-library is installed but no component tests exist today; defer unless feature breaks |
| Manual mobile QA | Real device or Chrome DevTools mobile emulation: 360×740 (small Android), 390×844 (iPhone 13), 768×1024 (iPad — should still render desktop) | Required before declaring done |

Testing convention: tests live next to source as `*.test.ts` (matches existing `pk-engine.test.ts`). Run via `pnpm test`.

---

## 9. Mobile UX Considerations

- **Card stack, not grid.** Dashboard cards stack `flex flex-col gap-3` on mobile.
- **Big numbers.** Current concentration uses `text-5xl font-mono` so it's glanceable.
- **Slope arrow.** Green ↑ when rising (slope > +0.1 ng/mL/day), red ↓ when falling (slope < -0.1), grey ↔ at "steady" (|slope| ≤ 0.1). Magnitude shown in a smaller font next to the arrow.
- **Baseline comparison bar.** Horizontal bar from trough → peak with the average marked as a tick and the current level as a dot. Dot color: emerald inside [trough, peak], amber outside.
- **Experience log form is one screen.** Mental state as 7 chip buttons (single-select), hunger and energy as native `<input type="range" min=1 max=10>` plus a numeric label, optional notes textarea, big "Save" button at the bottom. Target: 15 seconds to complete.
- **Numeric inputs:** `inputMode="numeric"` on number-only fields to surface the right mobile keyboard.
- **Tap-friendly delete.** Swipe-to-delete is out of scope; use a small trash icon on each log card (44×44 hit area).
- **Tailwind responsive prefix usage:** All new mobile components are written assuming mobile-only and use `sm:` / `md:` only sparingly (for tablet/landscape adjustments). Desktop components are untouched.
- **Color tokens already exist** (`--color-baseline`, `--color-experiment`, `--color-actual`, `--color-text-secondary`, etc. in `src/index.css`) — reuse them; do not introduce new theme colors.

---

## 10. File-by-File Implementation Order

Files to **create**:

```
src/hooks/useNow.ts
src/hooks/useIsMobile.ts
src/components/mobile/MobileApp.tsx
src/components/mobile/MobileHeader.tsx
src/components/mobile/MobileBottomNav.tsx
src/components/mobile/MobileDashboard.tsx
src/components/mobile/MobileChartView.tsx
src/components/mobile/MobileLogsView.tsx
src/components/mobile/CurrentLevelCard.tsx
src/components/mobile/SlopeIndicator.tsx
src/components/mobile/BaselineComparison.tsx
src/components/mobile/ExperienceLogForm.tsx
src/components/mobile/ExperienceLogList.tsx
src/components/shared/ViewModeToggle.tsx
src/store/patient-store.test.ts
```

Files to **modify**:

```
src/types/index.ts                              (add ExperienceLog, MentalState; extend PatientData)
src/lib/pk-engine.ts                            (add singleDoseSlope, slopeAtTime)
src/lib/pk-engine.test.ts                       (add slope tests)
src/store/ui-store.ts                           (add viewMode, mobileActiveTab, showExperienceLogForm)
src/store/patient-store.ts                     (add log CRUD)
src/components/layout/Header.tsx                (mount ViewModeToggle)
src/App.tsx                                     (branch on resolved view mode)
```

---

## Tasks (TDD, granular)

### Task 1: Add slope math to PK engine

**Files:**
- Modify: `src/lib/pk-engine.ts`
- Test: `src/lib/pk-engine.test.ts`

- [ ] **Step 1.1: Write failing tests for `singleDoseSlope`**

Two edits to `src/lib/pk-engine.test.ts`:

a) Add `singleDoseSlope` and `slopeAtTime` to the existing import statement at the top of the file. After the edit, the import should read:

```typescript
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
} from './pk-engine'
```

b) Append the following two describe blocks to the **bottom** of the file:

```typescript
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
```

- [ ] **Step 1.2: Run tests, verify they fail**

Run: `pnpm test -- pk-engine`
Expected: failures in the new `singleDoseSlope` and `slopeAtTime` describe blocks ("singleDoseSlope is not exported" or similar).

- [ ] **Step 1.3: Implement `singleDoseSlope` and `slopeAtTime`**

Append to `src/lib/pk-engine.ts`:

```typescript
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
```

- [ ] **Step 1.4: Run tests, verify they pass**

Run: `pnpm test -- pk-engine`
Expected: all tests pass, including the new slope tests.

- [ ] **Step 1.5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/lib/pk-engine.ts src/lib/pk-engine.test.ts
git commit -m "feat(pk-engine): add analytical slope (dC/dt) helpers"
```

---

### Task 2: Extend types with ExperienceLog

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 2.1: Add `MentalState` and `ExperienceLog`, extend `PatientData`**

In `src/types/index.ts`, after the `ComputedPlan` interface, append:

```typescript
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
}
```

Then change the existing `PatientData` interface to add the optional field:

```typescript
export interface PatientData {
  patient: Patient;
  plans: Plan[];
  activePlanIds: ActivePlanIds;
  experienceLogs?: ExperienceLog[];
}
```

- [ ] **Step 2.2: Verify nothing else broke**

Run: `npx tsc --noEmit`
Expected: clean. (Adding an optional field is backwards-compatible.)

- [ ] **Step 2.3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add ExperienceLog model and MentalState"
```

---

### Task 3: Add experience log CRUD to patient-store

**Files:**
- Modify: `src/store/patient-store.ts`
- Test: `src/store/patient-store.test.ts` (new file)

- [ ] **Step 3.1: Write failing tests**

Create `src/store/patient-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { usePatientStore } from './patient-store'
import type { ExperienceLog } from '../types'

function newLog(overrides: Partial<Omit<ExperienceLog, 'id'>> = {}): Omit<ExperienceLog, 'id'> {
  return {
    timestamp: Date.now(),
    mentalState: 'normal',
    hungerLevel: 5,
    energyLevel: 5,
    ...overrides,
  }
}

describe('patient-store experience logs', () => {
  beforeEach(() => {
    // Reset to a known single-patient state
    const { addPatient, patients, removePatient } = usePatientStore.getState()
    for (const pd of patients) removePatient(pd.patient.id)
    addPatient('TestPatient')
  })

  it('addExperienceLog appends a log with a generated id', () => {
    const { addExperienceLog, getExperienceLogs } = usePatientStore.getState()
    addExperienceLog(newLog({ timestamp: 1000 }))
    const logs = getExperienceLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].id).toBeTruthy()
    expect(logs[0].mentalState).toBe('normal')
  })

  it('getExperienceLogs returns logs sorted descending by timestamp', () => {
    const { addExperienceLog, getExperienceLogs } = usePatientStore.getState()
    addExperienceLog(newLog({ timestamp: 1000 }))
    addExperienceLog(newLog({ timestamp: 3000 }))
    addExperienceLog(newLog({ timestamp: 2000 }))
    const logs = getExperienceLogs()
    expect(logs.map(l => l.timestamp)).toEqual([3000, 2000, 1000])
  })

  it('removeExperienceLog deletes by id', () => {
    const { addExperienceLog, removeExperienceLog, getExperienceLogs } = usePatientStore.getState()
    addExperienceLog(newLog({ timestamp: 1000 }))
    addExperienceLog(newLog({ timestamp: 2000 }))
    const logs = getExperienceLogs()
    removeExperienceLog(logs[0].id)
    expect(getExperienceLogs().length).toBe(1)
    expect(getExperienceLogs()[0].timestamp).toBe(1000)
  })

  it('getExperienceLogs returns empty array when patient has no logs field', () => {
    const { getExperienceLogs } = usePatientStore.getState()
    expect(getExperienceLogs()).toEqual([])
  })
})
```

- [ ] **Step 3.2: Run tests, verify they fail**

Run: `pnpm test -- patient-store`
Expected: failures (`addExperienceLog is not a function`, etc.).

- [ ] **Step 3.3: Implement the three methods**

In `src/store/patient-store.ts`:

a) Add to imports at top:
```typescript
import type { PatientData, Plan, Dose, PlanType, PKParams, ExperienceLog } from '../types'
```

b) Add to the `PatientStore` interface, alongside the existing dose CRUD section:
```typescript
  // Experience logs
  addExperienceLog: (log: Omit<ExperienceLog, 'id'>) => void;
  removeExperienceLog: (logId: string) => void;
  getExperienceLogs: () => ExperienceLog[];
```

c) Implement inside the `return { ... }` block, after `setDoses`:
```typescript
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
```

- [ ] **Step 3.4: Run tests, verify pass**

Run: `pnpm test -- patient-store`
Expected: all 4 new tests pass.

- [ ] **Step 3.5: Run full test + type check**

```bash
pnpm test
npx tsc --noEmit
```

- [ ] **Step 3.6: Commit**

```bash
git add src/store/patient-store.ts src/store/patient-store.test.ts
git commit -m "feat(store): add experience log CRUD to patient-store"
```

---

### Task 4: Add `useNow` hook

**Files:**
- Create: `src/hooks/useNow.ts`

- [ ] **Step 4.1: Implement**

```typescript
import { useEffect, useState } from 'react'

/**
 * Returns Date.now() and re-renders every `intervalMs` (default 60s).
 * Use for "current time" displays that should auto-update without
 * triggering effects elsewhere.
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
```

- [ ] **Step 4.2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 4.3: Commit**

```bash
git add src/hooks/useNow.ts
git commit -m "feat(hooks): add useNow tick hook"
```

---

### Task 5: Add `useIsMobile` hook

**Files:**
- Create: `src/hooks/useIsMobile.ts`

- [ ] **Step 5.1: Implement**

```typescript
import { useEffect, useState } from 'react'

/**
 * Reactive media query for mobile width. Defaults to <= 767px (Tailwind's md- boundary).
 */
export function useIsMobile(maxWidthPx: number = 767): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidthPx])

  return isMobile
}
```

- [ ] **Step 5.2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/hooks/useIsMobile.ts
git commit -m "feat(hooks): add useIsMobile media query hook"
```

---

### Task 6: Extend `ui-store` with view mode and mobile tab state

**Files:**
- Modify: `src/store/ui-store.ts`

- [ ] **Step 6.1: Add fields**

Replace the contents of `src/store/ui-store.ts` with:

```typescript
import { create } from 'zustand'

export type ViewMode = 'auto' | 'mobile' | 'desktop';
export type MobileTab = 'dashboard' | 'chart' | 'logs';

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
}))
```

- [ ] **Step 6.2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/store/ui-store.ts
git commit -m "feat(store): add viewMode, mobileActiveTab, showExperienceLogForm"
```

---

### Task 7: Build `CurrentLevelCard`

**Files:**
- Create: `src/components/mobile/CurrentLevelCard.tsx`

- [ ] **Step 7.1: Implement**

```tsx
interface Props {
  concentration: number;       // ng/mL at "now"
  hasActualPlan: boolean;
}

export function CurrentLevelCard({ concentration, hasActualPlan }: Props) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
        Current Serum Level
      </div>
      {hasActualPlan ? (
        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-5xl font-mono font-semibold tabular-nums text-text">
            {concentration.toFixed(1)}
          </div>
          <div className="text-base text-text-secondary">ng/mL</div>
        </div>
      ) : (
        <div className="mt-2 text-sm text-text-secondary">
          No "Actual" plan yet. Create one and log doses to see your current level.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7.2: Commit**

```bash
git add src/components/mobile/CurrentLevelCard.tsx
git commit -m "feat(mobile): add CurrentLevelCard"
```

---

### Task 8: Build `SlopeIndicator`

**Files:**
- Create: `src/components/mobile/SlopeIndicator.tsx`

- [ ] **Step 8.1: Implement**

```tsx
interface Props {
  slopeNgPerMlPerHour: number;
}

const STEADY_THRESHOLD_PER_DAY = 0.1; // ng/mL/day below this magnitude = "steady"

export function SlopeIndicator({ slopeNgPerMlPerHour }: Props) {
  const perDay = slopeNgPerMlPerHour * 24
  const abs = Math.abs(perDay)
  const direction: 'up' | 'down' | 'steady' =
    perDay > STEADY_THRESHOLD_PER_DAY ? 'up'
    : perDay < -STEADY_THRESHOLD_PER_DAY ? 'down'
    : 'steady'

  const config = {
    up:     { arrow: '↑', label: 'Rising',  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    down:   { arrow: '↓', label: 'Falling', color: 'text-red-500',     bg: 'bg-red-50' },
    steady: { arrow: '↔', label: 'Steady',  color: 'text-text-secondary', bg: 'bg-surface-alt' },
  }[direction]

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
        Trend
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold ${config.bg} ${config.color}`}>
          {config.arrow}
        </div>
        <div className="flex flex-col">
          <div className={`text-base font-semibold ${config.color}`}>{config.label}</div>
          <div className="font-mono text-sm tabular-nums text-text-secondary">
            {perDay >= 0 ? '+' : ''}{perDay.toFixed(2)} ng/mL/day
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: Commit**

```bash
git add src/components/mobile/SlopeIndicator.tsx
git commit -m "feat(mobile): add SlopeIndicator"
```

---

### Task 9: Build `BaselineComparison`

**Files:**
- Create: `src/components/mobile/BaselineComparison.tsx`

- [ ] **Step 9.1: Implement**

```tsx
interface Props {
  currentNgMl: number;
  baselinePeak: number;
  baselineTrough: number;
  baselineAverage: number;
}

export function BaselineComparison({ currentNgMl, baselinePeak, baselineTrough, baselineAverage }: Props) {
  // Position fraction along [trough, peak]
  const span = Math.max(baselinePeak - baselineTrough, 1e-6)
  const clampedCurrent = Math.max(baselineTrough, Math.min(baselinePeak, currentNgMl))
  const currentPct = ((clampedCurrent - baselineTrough) / span) * 100
  const avgPct = ((baselineAverage - baselineTrough) / span) * 100
  const insideZone = currentNgMl >= baselineTrough && currentNgMl <= baselinePeak

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-secondary font-medium">
          vs Baseline
        </div>
        <div className="text-[10px] text-text-secondary">trough → peak</div>
      </div>

      <div className="mt-4 relative h-3 rounded-full bg-baseline/15">
        {/* Average tick */}
        <div
          className="absolute top-0 bottom-0 w-px bg-baseline/50"
          style={{ left: `${avgPct}%` }}
          title={`Average: ${baselineAverage.toFixed(1)}`}
        />
        {/* Current marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-surface ${insideZone ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ left: `calc(${currentPct}% - 8px)` }}
          title={`Current: ${currentNgMl.toFixed(1)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Trough" value={baselineTrough} />
        <Stat label="Average" value={baselineAverage} />
        <Stat label="Peak" value={baselinePeak} />
      </div>

      <div className="mt-3 text-xs text-text-secondary text-center">
        Current: <span className="font-mono font-semibold text-text">{currentNgMl.toFixed(1)} ng/mL</span>
        {!insideZone && (
          <span className={`ml-2 ${currentNgMl > baselinePeak ? 'text-amber-600' : 'text-amber-600'}`}>
            ({currentNgMl > baselinePeak ? 'above peak' : 'below trough'})
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value.toFixed(1)}</div>
    </div>
  )
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/components/mobile/BaselineComparison.tsx
git commit -m "feat(mobile): add BaselineComparison card"
```

---

### Task 10: Build `MobileDashboard`

**Files:**
- Create: `src/components/mobile/MobileDashboard.tsx`

- [ ] **Step 10.1: Implement**

```tsx
import { useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { useNow } from '../../hooks/useNow'
import {
  computeConcentrationCurve,
  computeMetrics,
  concentrationAtTime,
  slopeAtTime,
} from '../../lib/pk-engine'
import { doseDateRange } from '../../lib/date-utils'
import { CurrentLevelCard } from './CurrentLevelCard'
import { SlopeIndicator } from './SlopeIndicator'
import { BaselineComparison } from './BaselineComparison'

export function MobileDashboard() {
  const { getActivePlan } = usePatientStore()
  const { setShowExperienceLogForm } = useUIStore()
  const now = useNow(60_000)

  const actualPlan = getActivePlan('actual')
  const baselinePlan = getActivePlan('baseline')

  const currentConcentration = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return 0
    return concentrationAtTime(actualPlan.doses, actualPlan.pkParams, now, actualPlan.startingWeightLbs)
  }, [actualPlan, now])

  const currentSlopePerHour = useMemo(() => {
    if (!actualPlan || actualPlan.doses.length === 0) return 0
    return slopeAtTime(actualPlan.doses, actualPlan.pkParams, now, actualPlan.startingWeightLbs)
  }, [actualPlan, now])

  const baselineMetrics = useMemo(() => {
    if (!baselinePlan || baselinePlan.doses.length === 0) return null
    const range = doseDateRange(baselinePlan.doses, 1, 14)
    const curve = computeConcentrationCurve(baselinePlan.doses, baselinePlan.pkParams, range.start, range.end, 2, baselinePlan.startingWeightLbs)
    return computeMetrics(curve, baselinePlan.doses)
  }, [baselinePlan])

  const hasActual = !!actualPlan && actualPlan.doses.length > 0

  return (
    <div className="flex flex-col gap-3 p-4 pb-32">
      <CurrentLevelCard concentration={currentConcentration} hasActualPlan={hasActual} />

      {hasActual && <SlopeIndicator slopeNgPerMlPerHour={currentSlopePerHour} />}

      {hasActual && baselineMetrics && baselineMetrics.peakConcentration > 0 && (
        <BaselineComparison
          currentNgMl={currentConcentration}
          baselinePeak={baselineMetrics.peakConcentration}
          baselineTrough={baselineMetrics.troughConcentration}
          baselineAverage={baselineMetrics.averageConcentration}
        />
      )}

      <button
        onClick={() => setShowExperienceLogForm(true)}
        className="mt-3 w-full min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base shadow-sm active:bg-primary-700 transition-colors"
      >
        Log How I Feel
      </button>
    </div>
  )
}
```

- [ ] **Step 10.2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/mobile/MobileDashboard.tsx
git commit -m "feat(mobile): add MobileDashboard composition"
```

---

### Task 11: Build `ExperienceLogForm`

**Files:**
- Create: `src/components/mobile/ExperienceLogForm.tsx`

- [ ] **Step 11.1: Implement**

```tsx
import { useState } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { concentrationAtTime, slopeAtTime, doseTimestamp } from '../../lib/pk-engine'
import { MENTAL_STATES, type MentalState } from '../../types'

export function ExperienceLogForm() {
  const { showExperienceLogForm, setShowExperienceLogForm } = useUIStore()
  const { getActivePlan, addExperienceLog } = usePatientStore()

  const [mentalState, setMentalState] = useState<MentalState>('normal')
  const [hunger, setHunger] = useState(5)
  const [energy, setEnergy] = useState(5)
  const [notes, setNotes] = useState('')

  if (!showExperienceLogForm) return null

  function handleSubmit() {
    const ts = Date.now()
    const actual = getActivePlan('actual')

    let serum: number | undefined
    let slopePerHour: number | undefined
    let hoursSinceLast: number | undefined

    if (actual && actual.doses.length > 0) {
      serum = concentrationAtTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)
      slopePerHour = slopeAtTime(actual.doses, actual.pkParams, ts, actual.startingWeightLbs)

      const lastDoseTs = Math.max(...actual.doses.map(doseTimestamp).filter(t => t <= ts))
      if (Number.isFinite(lastDoseTs)) {
        hoursSinceLast = (ts - lastDoseTs) / (1000 * 3600)
      }
    }

    addExperienceLog({
      timestamp: ts,
      mentalState,
      hungerLevel: hunger,
      energyLevel: energy,
      notes: notes.trim() || undefined,
      serumConcentration: serum,
      slopeNgPerMlPerHour: slopePerHour,
      hoursSinceLastDose: hoursSinceLast,
    })

    // Reset & close
    setMentalState('normal')
    setHunger(5)
    setEnergy(5)
    setNotes('')
    setShowExperienceLogForm(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40" onClick={() => setShowExperienceLogForm(false)}>
      <div
        className="bg-surface w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">How are you feeling?</h3>
          <button
            onClick={() => setShowExperienceLogForm(false)}
            className="w-9 h-9 rounded-full hover:bg-surface-alt flex items-center justify-center"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mental state chips */}
        <div className="mb-4">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Mental State</div>
          <div className="flex flex-wrap gap-2">
            {MENTAL_STATES.map(s => (
              <button
                key={s}
                onClick={() => setMentalState(s)}
                className={`min-h-11 px-4 rounded-full border text-sm capitalize transition-colors ${
                  mentalState === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-border text-text-secondary hover:bg-surface-alt'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Hunger slider */}
        <ScaleSlider label="Hunger" value={hunger} onChange={setHunger} />

        {/* Energy slider */}
        <ScaleSlider label="Energy" value={energy} onChange={setEnergy} />

        {/* Notes */}
        <label className="block mb-5">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything else you want to remember about right now?"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:border-primary-400 resize-none"
          />
        </label>

        <button
          onClick={handleSubmit}
          className="w-full min-h-14 rounded-2xl bg-primary-600 text-white font-semibold text-base active:bg-primary-700"
        >
          Save Log
        </button>
      </div>
    </div>
  )
}

function ScaleSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</span>
        <span className="font-mono font-semibold text-base tabular-nums">{value}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-primary-600 h-3"
      />
      <div className="flex justify-between text-[10px] text-text-secondary mt-1">
        <span>1</span><span>5</span><span>10</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 11.2: Type-check & commit**

```bash
npx tsc --noEmit
git add src/components/mobile/ExperienceLogForm.tsx
git commit -m "feat(mobile): add ExperienceLogForm modal"
```

---

### Task 12: Build `ExperienceLogList`

**Files:**
- Create: `src/components/mobile/ExperienceLogList.tsx`

- [ ] **Step 12.1: Implement**

```tsx
import { format } from 'date-fns'
import type { ExperienceLog } from '../../types'

interface Props {
  logs: ExperienceLog[];
  onDelete: (id: string) => void;
}

export function ExperienceLogList({ logs, onDelete }: Props) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary text-sm">
        No logs yet. Tap "Log How I Feel" on the dashboard to get started.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {logs.map(log => (
        <LogCard key={log.id} log={log} onDelete={onDelete} />
      ))}
    </div>
  )
}

function LogCard({ log, onDelete }: { log: ExperienceLog; onDelete: (id: string) => void }) {
  const date = new Date(log.timestamp)
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text">
            {format(date, 'MMM d, yyyy')} <span className="text-text-secondary font-normal">· {format(date, 'h:mm a')}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
            <span className="capitalize px-2 py-0.5 rounded-full bg-surface-alt">{log.mentalState}</span>
            <span>Hunger {log.hungerLevel}/10</span>
            <span>Energy {log.energyLevel}/10</span>
          </div>
          {log.serumConcentration != null && (
            <div className="mt-2 text-xs text-text-secondary font-mono">
              Serum: {log.serumConcentration.toFixed(1)} ng/mL
              {log.slopeNgPerMlPerHour != null && (
                <span> · Trend: {(log.slopeNgPerMlPerHour * 24 >= 0 ? '+' : '')}{(log.slopeNgPerMlPerHour * 24).toFixed(2)}/day</span>
              )}
              {log.hoursSinceLastDose != null && (
                <span> · {log.hoursSinceLastDose.toFixed(1)}h since dose</span>
              )}
            </div>
          )}
          {log.notes && (
            <div className="mt-2 text-sm text-text whitespace-pre-wrap">{log.notes}</div>
          )}
        </div>
        <button
          onClick={() => onDelete(log.id)}
          className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-500"
          aria-label="Delete log"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 12.2: Commit**

```bash
git add src/components/mobile/ExperienceLogList.tsx
git commit -m "feat(mobile): add ExperienceLogList"
```

---

### Task 13: Build `MobileLogsView`

**Files:**
- Create: `src/components/mobile/MobileLogsView.tsx`

- [ ] **Step 13.1: Implement**

```tsx
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { ExperienceLogList } from './ExperienceLogList'

export function MobileLogsView() {
  const { getExperienceLogs, removeExperienceLog } = usePatientStore()
  const { setShowExperienceLogForm } = useUIStore()
  const logs = getExperienceLogs()

  return (
    <div className="p-4 pb-32">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Experience Logs</h2>
        <button
          onClick={() => setShowExperienceLogForm(true)}
          className="min-h-11 px-4 rounded-full bg-primary-600 text-white text-sm font-semibold active:bg-primary-700"
        >
          + New
        </button>
      </div>
      <ExperienceLogList logs={logs} onDelete={removeExperienceLog} />
    </div>
  )
}
```

- [ ] **Step 13.2: Commit**

```bash
git add src/components/mobile/MobileLogsView.tsx
git commit -m "feat(mobile): add MobileLogsView"
```

---

### Task 14: Build `MobileChartView`

**Files:**
- Create: `src/components/mobile/MobileChartView.tsx`

- [ ] **Step 14.1: Implement**

This wraps the existing `<ConcentrationChart>` (from `src/components/comparison/ConcentrationChart.tsx`) with the same data-prep logic used in `ComparisonView` so we don't duplicate math. We deliberately skip `MetricsPanel` and `DoseTable` on mobile (out of scope).

```tsx
import { useMemo } from 'react'
import { usePatientStore } from '../../store/patient-store'
import { useUIStore } from '../../store/ui-store'
import { computeConcentrationCurve, computeMetrics, doseTimestamp } from '../../lib/pk-engine'
import { doseDateRange } from '../../lib/date-utils'
import { ConcentrationChart } from '../comparison/ConcentrationChart'
import type { Plan, ComputedPlan } from '../../types'

function computePlan(plan: Plan | undefined, start: Date, end: Date, resolutionHours: number): ComputedPlan | null {
  if (!plan || plan.doses.length === 0) return null
  const curve = computeConcentrationCurve(plan.doses, plan.pkParams, start, end, resolutionHours, plan.startingWeightLbs)
  const metrics = computeMetrics(curve, plan.doses)
  return { plan, curve, metrics }
}

export function MobileChartView() {
  const { getActivePlan } = usePatientStore()
  const { chartResolutionHours, hiddenPlanIds } = useUIStore()

  const baselinePlan = getActivePlan('baseline')
  const experimentPlan = getActivePlan('experiment')
  const actualPlan = getActivePlan('actual')

  const baselineVisible = baselinePlan ? !hiddenPlanIds.includes(baselinePlan.id) : false
  const experimentVisible = experimentPlan ? !hiddenPlanIds.includes(experimentPlan.id) : false
  const actualVisible = actualPlan ? !hiddenPlanIds.includes(actualPlan.id) : false

  const dateRange = useMemo(() => {
    const allDoses = [
      ...(baselinePlan?.doses ?? []),
      ...(experimentPlan?.doses ?? []),
      ...(actualPlan?.doses ?? []),
    ]
    return doseDateRange(allDoses, 1, 14)
  }, [baselinePlan?.doses, experimentPlan?.doses, actualPlan?.doses])

  const baseline = useMemo(() => computePlan(baselinePlan, dateRange.start, dateRange.end, chartResolutionHours), [baselinePlan, dateRange, chartResolutionHours])
  const experiment = useMemo(() => computePlan(experimentPlan, dateRange.start, dateRange.end, chartResolutionHours), [experimentPlan, dateRange, chartResolutionHours])
  const actual = useMemo(() => computePlan(actualPlan, dateRange.start, dateRange.end, chartResolutionHours), [actualPlan, dateRange, chartResolutionHours])

  const chartData = useMemo(() => {
    const visiblePlans = [
      baselineVisible ? baseline : null,
      experimentVisible ? experiment : null,
      actualVisible ? actual : null,
    ]
    const timeSet = new Set<number>()
    for (const cp of visiblePlans) if (cp) cp.curve.forEach(p => timeSet.add(p.timestamp))
    const times = Array.from(timeSet).sort((a, b) => a - b)
    return times.map(ts => ({
      timestamp: ts,
      day: (ts - dateRange.start.getTime()) / (24 * 3600 * 1000),
      baseline: baselineVisible ? baseline?.curve.find(p => p.timestamp === ts)?.concentration : undefined,
      experiment: experimentVisible ? experiment?.curve.find(p => p.timestamp === ts)?.concentration : undefined,
      actual: actualVisible ? actual?.curve.find(p => p.timestamp === ts)?.concentration : undefined,
    }))
  }, [baseline, experiment, actual, dateRange, baselineVisible, experimentVisible, actualVisible])

  const doseMarkers = useMemo(() => {
    const markers: Array<{ timestamp: number; day: number; type: string; mg: number }> = []
    const startMs = dateRange.start.getTime()
    const visibleEntries: Array<[typeof baselinePlan, boolean]> = [
      [baselinePlan, baselineVisible],
      [experimentPlan, experimentVisible],
      [actualPlan, actualVisible],
    ]
    for (const [plan, visible] of visibleEntries) {
      if (!plan || !visible) continue
      for (const dose of plan.doses) {
        const ts = doseTimestamp(dose)
        markers.push({ timestamp: ts, day: (ts - startMs) / (24 * 3600 * 1000), type: plan.type, mg: dose.amountMg })
      }
    }
    return markers
  }, [baselinePlan, experimentPlan, actualPlan, dateRange, baselineVisible, experimentVisible, actualVisible])

  const hasAny = baseline || experiment || actual

  return (
    <div className="p-3 pb-32">
      {!hasAny ? (
        <div className="text-center py-16 text-text-secondary">
          <p className="text-base font-medium mb-1">No plans with doses yet</p>
          <p className="text-sm">Switch to desktop view to set up plans.</p>
        </div>
      ) : (
        <ConcentrationChart
          data={chartData}
          doseMarkers={doseMarkers}
          baselineColor={baselinePlan?.color ?? '#3b82f6'}
          experimentColor={experimentPlan?.color ?? '#f59e0b'}
          actualColor={actualPlan?.color ?? '#10b981'}
          hasBaseline={!!baseline && baselineVisible}
          hasExperiment={!!experiment && experimentVisible}
          hasActual={!!actual && actualVisible}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 14.2: Commit**

```bash
git add src/components/mobile/MobileChartView.tsx
git commit -m "feat(mobile): add MobileChartView"
```

---

### Task 15: Build `MobileBottomNav`

**Files:**
- Create: `src/components/mobile/MobileBottomNav.tsx`

- [ ] **Step 15.1: Implement**

```tsx
import type { ReactNode } from 'react'
import type { MobileTab } from '../../store/ui-store'

interface Props {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: Array<{ id: MobileTab; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Today', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  )},
  { id: 'chart', label: 'Chart', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  )},
  { id: 'logs', label: 'Logs', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  )},
]

export function MobileBottomNav({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)] z-40">
      <div className="flex">
        {TABS.map(tab => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex-1 h-14 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-primary-600' : 'text-text-secondary'
              }`}
            >
              {tab.icon}
              <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 15.2: Commit**

```bash
git add src/components/mobile/MobileBottomNav.tsx
git commit -m "feat(mobile): add MobileBottomNav"
```

---

### Task 16: Build `ViewModeToggle`

**Files:**
- Create: `src/components/shared/ViewModeToggle.tsx`

- [ ] **Step 16.1: Implement**

```tsx
import { useUIStore } from '../../store/ui-store'

export function ViewModeToggle() {
  const { viewMode, setViewMode } = useUIStore()

  return (
    <div className="flex items-center rounded-full border border-border overflow-hidden text-[10px] font-semibold">
      {(['auto', 'mobile', 'desktop'] as const).map(mode => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`px-2.5 py-1 capitalize transition-colors ${
            viewMode === mode ? 'bg-primary-600 text-white' : 'text-text-secondary hover:bg-surface-alt'
          }`}
          title={`View mode: ${mode}`}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 16.2: Commit**

```bash
git add src/components/shared/ViewModeToggle.tsx
git commit -m "feat(shared): add ViewModeToggle"
```

---

### Task 17: Build `MobileHeader`

**Files:**
- Create: `src/components/mobile/MobileHeader.tsx`

- [ ] **Step 17.1: Implement**

```tsx
import { PatientSelector } from '../patient/PatientSelector'
import { ViewModeToggle } from '../shared/ViewModeToggle'

export function MobileHeader() {
  return (
    <header className="bg-surface border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-primary-600 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold text-text truncate">Tirzepatide PK</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewModeToggle />
          <PatientSelector />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 17.2: Commit**

```bash
git add src/components/mobile/MobileHeader.tsx
git commit -m "feat(mobile): add MobileHeader"
```

---

### Task 18: Build `MobileApp` shell

**Files:**
- Create: `src/components/mobile/MobileApp.tsx`

- [ ] **Step 18.1: Implement**

```tsx
import { useUIStore } from '../../store/ui-store'
import { MobileHeader } from './MobileHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { MobileDashboard } from './MobileDashboard'
import { MobileChartView } from './MobileChartView'
import { MobileLogsView } from './MobileLogsView'
import { ExperienceLogForm } from './ExperienceLogForm'

export function MobileApp() {
  const { mobileActiveTab, setMobileActiveTab } = useUIStore()

  return (
    <div className="h-full flex flex-col bg-surface-alt">
      <MobileHeader />
      <main className="flex-1 overflow-y-auto">
        {mobileActiveTab === 'dashboard' && <MobileDashboard />}
        {mobileActiveTab === 'chart' && <MobileChartView />}
        {mobileActiveTab === 'logs' && <MobileLogsView />}
      </main>
      <MobileBottomNav active={mobileActiveTab} onChange={setMobileActiveTab} />
      <ExperienceLogForm />
    </div>
  )
}
```

- [ ] **Step 18.2: Commit**

```bash
git add src/components/mobile/MobileApp.tsx
git commit -m "feat(mobile): add MobileApp shell"
```

---

### Task 19: Wire `App.tsx` to branch on view mode

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 19.1: Replace `App` with view-mode-aware version**

Replace the entire contents of `src/App.tsx` with:

```tsx
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { MobileApp } from './components/mobile/MobileApp'
import { useUIStore } from './store/ui-store'
import { useIsMobile } from './hooks/useIsMobile'

export default function App() {
  const { viewMode } = useUIStore()
  const isMobileViewport = useIsMobile()

  const effectiveMode: 'mobile' | 'desktop' =
    viewMode === 'auto' ? (isMobileViewport ? 'mobile' : 'desktop') : viewMode

  if (effectiveMode === 'mobile') {
    return <MobileApp />
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <footer className="px-4 py-2 text-center text-xs text-text-secondary border-t border-border bg-surface">
        Educational tool only — not medical advice. Discuss any dosing changes with your prescriber.
      </footer>
    </div>
  )
}
```

- [ ] **Step 19.2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 19.3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): branch root layout on view mode (mobile vs desktop)"
```

---

### Task 20: Add `ViewModeToggle` to desktop header

**Files:**
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 20.1: Mount the toggle**

Replace `src/components/layout/Header.tsx` with:

```tsx
import { PatientSelector } from '../patient/PatientSelector'
import { ViewModeToggle } from '../shared/ViewModeToggle'

export function Header() {
  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-text">Tirzepatide PK Scheduler</h1>
      </div>
      <div className="flex items-center gap-3">
        <ViewModeToggle />
        <PatientSelector />
      </div>
    </header>
  )
}
```

- [ ] **Step 20.2: Commit**

```bash
git add src/components/layout/Header.tsx
git commit -m "feat(header): add ViewModeToggle to desktop header"
```

---

### Task 21: Manual mobile QA pass

- [ ] **Step 21.1: Start dev**

```bash
pnpm dev
```

- [ ] **Step 21.2: Open Chrome DevTools mobile emulation, set viewport to 390×844 (iPhone 13).**

- [ ] **Step 21.3: Verify dashboard tab**
  - Current Serum Level shows a number with "ng/mL" suffix.
  - Trend card shows arrow + per-day rate; arrow color matches direction.
  - vs Baseline card shows trough/avg/peak labels and a horizontal bar.
  - "Log How I Feel" button is full-width and at least 56 px tall.

- [ ] **Step 21.4: Verify experience log flow**
  - Tap "Log How I Feel" → modal slides up from bottom (or rounded sheet).
  - Pick a mental state chip — selected chip turns blue.
  - Adjust hunger and energy sliders — value indicator updates.
  - Optional notes field accepts text.
  - Tap "Save Log" → modal closes; log appears at top of Logs tab.
  - Re-open dashboard → counts/snapshots persisted (refresh page; log still there after server load).

- [ ] **Step 21.5: Verify chart tab**
  - Recharts renders within the viewport, no horizontal overflow.
  - Pinch-zoom works (two-finger pinch in DevTools touch mode).

- [ ] **Step 21.6: Verify view mode toggle**
  - In header, three-button toggle reads `auto | mobile | desktop` with current mode highlighted.
  - Tap "desktop" while in mobile viewport → desktop layout renders (ComparisonView).
  - Tap "auto" → returns to mobile layout.

- [ ] **Step 21.7: Verify desktop is unchanged**
  - Set viewport to 1280 × 800.
  - Desktop ComparisonView, Sidebar, DoseTable all render and behave as before.
  - View mode toggle visible in desktop header; toggling to "mobile" forces mobile layout.

- [ ] **Step 21.8: Verify persistence**
  - Refresh page in mobile viewport → previously created experience logs reload from `/api/patients/:id`.
  - Inspect `data/<patientId>.json` on disk → contains `experienceLogs` array.

- [ ] **Step 21.9: Final type-check & test pass**

```bash
npx tsc --noEmit
pnpm test
```

- [ ] **Step 21.10: Commit any QA tweaks**

If style/spacing tweaks were needed:
```bash
git add <changed files>
git commit -m "polish(mobile): QA tweaks for spacing and touch targets"
```

---

## Open questions / non-goals

- **Mobile dose editing.** Out of scope. The `Plans` and `DoseTable` UIs remain desktop-only; mobile users can add/edit doses by toggling to desktop view.
- **Correlation analysis** between experience logs and PK data is **not** built in this plan, but the data model (snapshot fields on `ExperienceLog`) is laid out so a later analysis view can read `getExperienceLogs()` and group by hour-since-last-dose, slope sign, etc., without recomputing curves.
- **Push notifications / reminders** are out of scope.
- **Multi-line chart in mobile dashboard** is out of scope; the dedicated Chart tab covers that.
