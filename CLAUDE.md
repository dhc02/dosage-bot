# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tirzepatide PK Scheduler — a web-based pharmacokinetic dose planning tool for subcutaneous tirzepatide. Educational/personal use only, not a medical product. Uses a one-compartment PK model with first-order absorption validated against published literature.

## Commands

```bash
pnpm dev            # Start both API server (port 3001) and Vite client (port 5173)
pnpm dev:server     # API server only
pnpm dev:client     # Vite dev server only (needs API server for persistence)
pnpm build          # Production build to dist/
pnpm test           # Run tests once
npx vitest          # Run tests in watch mode
npx tsc --noEmit    # Type check without emitting
```

## Architecture

**Stack**: React 19 + TypeScript, Vite, Tailwind CSS 4, Recharts, Zustand, date-fns. Express API server for persistence.

**Key modules**:
- `src/lib/pk-engine.ts` — Pure PK math engine (zero React deps). Core formula: `C(t) = (F*D*ka)/(Vd*(ka-ke)) * (e^(-ke*t) - e^(-ka*t))`. Multiple doses use superposition. This is the most critical module.
- `src/lib/standard-schedules.ts` — FDA titration template and repeating schedule generators.
- `src/store/patient-store.ts` — Zustand store with persist middleware. Manages patients, plans, doses. Auto-creates a default patient on first load.
- `src/store/ui-store.ts` — Transient UI state (selected plan, chart resolution, modals).
- `src/components/comparison/ComparisonView.tsx` — Main view: computes curves via `useMemo`, composes chart + metrics + dose table.
- `src/components/comparison/ConcentrationChart.tsx` — Recharts multi-line chart (baseline=blue, experiment=orange, actual=green dashed).

- `server/index.ts` — Express API server. Stores patient data as JSON files in `data/` directory. CRUD endpoints at `/api/patients`.
- `src/lib/api.ts` — Frontend API client for the Express backend.

**Data model**: Patient → Plans (baseline/experiment/actual) → Doses. Each plan has its own PK params so users can experiment with different Vd/bioavailability values. Data is persisted to both localStorage (for offline fallback) and the API server (JSON files in `data/`). Changes debounce-save to the server after 500ms.

**PK parameters** (defaults in `src/types/index.ts`): half-life 5 days, bioavailability 0.80, Vd 10.3L, ka 0.0373/hr.
