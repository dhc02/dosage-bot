import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'

const app = express()
const PORT = 3001
const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data')
const MAX_CHANGELOG_ENTRIES = 200

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Serve built frontend in production
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist')
try {
  await fs.access(DIST_DIR)
  app.use(express.static(DIST_DIR))
} catch {
  // dist doesn't exist (dev mode) — Vite handles frontend
}

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true })

function patientFile(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(DATA_DIR, `${safeId}.json`)
}

function changelogFile(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(DATA_DIR, `${safeId}-changelog.json`)
}

// ---- Semantic diff engine ----

type ChangeType =
  | 'dose_added' | 'dose_removed' | 'dose_modified'
  | 'plan_added' | 'plan_removed' | 'plan_renamed'
  | 'params_changed' | 'active_plan_changed'
  | 'starting_weight_changed'
  | 'patient_renamed'

interface FieldChange { old: unknown; new: unknown }
interface ChangeEntry {
  type: ChangeType
  planId?: string
  planName?: string
  planType?: string
  doseId?: string
  doseDescription?: string
  fields?: Record<string, FieldChange>
}

interface ChangelogEntry {
  timestamp: string
  changes: ChangeEntry[]
}

function doseDesc(d: Record<string, unknown>): string {
  const date = d.date || '?'
  const time = d.time || '?'
  const mg = d.amountMg ?? '?'
  return `${mg}mg on ${date} at ${time}`
}

function computeDiff(oldData: Record<string, unknown>, newData: Record<string, unknown>): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  const oldPlans = (oldData.plans as any[]) ?? []
  const newPlans = (newData.plans as any[]) ?? []

  const oldPlanMap = new Map(oldPlans.map(p => [p.id, p]))
  const newPlanMap = new Map(newPlans.map(p => [p.id, p]))

  // Patient rename
  const oldName = (oldData.patient as any)?.name
  const newName = (newData.patient as any)?.name
  if (oldName !== newName) {
    changes.push({
      type: 'patient_renamed',
      fields: { name: { old: oldName, new: newName } },
    })
  }

  // Plan changes
  for (const [id, newPlan] of newPlanMap) {
    const oldPlan = oldPlanMap.get(id)
    if (!oldPlan) {
      changes.push({
        type: 'plan_added',
        planId: newPlan.id,
        planName: newPlan.name,
        planType: newPlan.type,
      })
      continue
    }

    // Plan rename
    if (oldPlan.name !== newPlan.name) {
      changes.push({
        type: 'plan_renamed',
        planId: newPlan.id,
        planName: newPlan.name,
        fields: { name: { old: oldPlan.name, new: newPlan.name } },
      })
    }

    // Starting weight change
    if (oldPlan.startingWeightLbs !== newPlan.startingWeightLbs) {
      changes.push({
        type: 'starting_weight_changed',
        planId: newPlan.id,
        planName: newPlan.name,
        fields: {
          startingWeightLbs: { old: oldPlan.startingWeightLbs, new: newPlan.startingWeightLbs },
        },
      })
    }

    // PK params change
    const paramFields: Record<string, FieldChange> = {}
    for (const key of ['halfLifeDays', 'bioavailability', 'volumeOfDistL', 'absorptionRateKa']) {
      if (oldPlan.pkParams[key] !== newPlan.pkParams[key]) {
        paramFields[key] = { old: oldPlan.pkParams[key], new: newPlan.pkParams[key] }
      }
    }
    if (Object.keys(paramFields).length > 0) {
      changes.push({
        type: 'params_changed',
        planId: newPlan.id,
        planName: newPlan.name,
        fields: paramFields,
      })
    }

    // Dose changes
    const oldDoses = (oldPlan.doses as any[]) ?? []
    const newDoses = (newPlan.doses as any[]) ?? []
    const oldDoseMap = new Map(oldDoses.map(d => [d.id, d]))
    const newDoseMap = new Map(newDoses.map(d => [d.id, d]))

    for (const [doseId, newDose] of newDoseMap) {
      const oldDose = oldDoseMap.get(doseId)
      if (!oldDose) {
        changes.push({
          type: 'dose_added',
          planId: newPlan.id,
          planName: newPlan.name,
          doseId: newDose.id,
          doseDescription: doseDesc(newDose),
        })
        continue
      }

      const fields: Record<string, FieldChange> = {}
      for (const key of ['date', 'time', 'amountMg', 'injectionSite', 'note', 'weightLbs']) {
        if (JSON.stringify(oldDose[key]) !== JSON.stringify(newDose[key])) {
          fields[key] = { old: oldDose[key], new: newDose[key] }
        }
      }
      if (Object.keys(fields).length > 0) {
        changes.push({
          type: 'dose_modified',
          planId: newPlan.id,
          planName: newPlan.name,
          doseId: newDose.id,
          doseDescription: doseDesc(newDose),
          fields,
        })
      }
    }

    for (const [doseId, oldDose] of oldDoseMap) {
      if (!newDoseMap.has(doseId)) {
        changes.push({
          type: 'dose_removed',
          planId: newPlan.id,
          planName: newPlan.name,
          doseId: oldDose.id,
          doseDescription: doseDesc(oldDose),
        })
      }
    }
  }

  // Removed plans
  for (const [id, oldPlan] of oldPlanMap) {
    if (!newPlanMap.has(id)) {
      changes.push({
        type: 'plan_removed',
        planId: oldPlan.id,
        planName: oldPlan.name,
        planType: oldPlan.type,
      })
    }
  }

  // Active plan changes
  const oldActive = (oldData.activePlanIds as Record<string, string | null>) ?? {}
  const newActive = (newData.activePlanIds as Record<string, string | null>) ?? {}
  for (const type of ['baseline', 'experiment', 'actual']) {
    if (oldActive[type] !== newActive[type]) {
      changes.push({
        type: 'active_plan_changed',
        planType: type,
        fields: { planId: { old: oldActive[type], new: newActive[type] } },
      })
    }
  }

  return changes
}

async function appendChangelog(patientId: string, entry: ChangelogEntry): Promise<void> {
  const file = changelogFile(patientId)
  let log: ChangelogEntry[] = []
  try {
    const raw = await fs.readFile(file, 'utf-8')
    log = JSON.parse(raw)
  } catch {
    // no existing changelog — start fresh
  }
  log.push(entry)
  // Trim old entries
  while (log.length > MAX_CHANGELOG_ENTRIES) {
    log.shift()
  }
  await fs.writeFile(file, JSON.stringify(log, null, 2))
}

// List all patients (just id + name, not full data)
app.get('/api/patients', async (_req, res) => {
  const files = await fs.readdir(DATA_DIR)
  const patients = []
  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('-changelog')) continue
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8')
      const data = JSON.parse(raw)
      patients.push({
        id: data.patient.id,
        name: data.patient.name,
        createdAt: data.patient.createdAt,
      })
    } catch {
      // skip corrupt files
    }
  }
  res.json(patients)
})

// Get full patient data
app.get('/api/patients/:id', async (req, res) => {
  try {
    const raw = await fs.readFile(patientFile(req.params.id), 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.status(404).json({ error: 'Patient not found' })
  }
})

// Save/update patient data (with changelog)
app.put('/api/patients/:id', async (req, res) => {
  const data = req.body
  if (!data.patient || !data.plans || !data.activePlanIds) {
    res.status(400).json({ error: 'Invalid patient data' })
    return
  }

  // Read old data for diff
  let oldData: Record<string, unknown> | null = null
  try {
    const raw = await fs.readFile(patientFile(req.params.id), 'utf-8')
    oldData = JSON.parse(raw)
  } catch {
    // new patient — no old data to diff against
  }

  // Write new data
  await fs.writeFile(patientFile(req.params.id), JSON.stringify(data, null, 2))

  // Compute and save changelog
  if (oldData) {
    const changes = computeDiff(oldData, data)
    if (changes.length > 0) {
      await appendChangelog(req.params.id, {
        timestamp: new Date().toISOString(),
        changes,
      })
    }
  }

  res.json({ ok: true })
})

// Delete patient
app.delete('/api/patients/:id', async (req, res) => {
  try {
    await fs.unlink(patientFile(req.params.id))
  } catch {
    // already gone
  }
  // Also clean up changelog
  try {
    await fs.unlink(changelogFile(req.params.id))
  } catch {
    // already gone
  }
  res.json({ ok: true })
})

// Get changelog for a patient
app.get('/api/patients/:id/changelog', async (req, res) => {
  try {
    const raw = await fs.readFile(changelogFile(req.params.id), 'utf-8')
    res.json(JSON.parse(raw))
  } catch {
    res.json([])
  }
})

// Restore a specific historical state (undo a single save)
app.post('/api/patients/:id/restore', async (req, res) => {
  const { targetTimestamp } = req.body
  if (!targetTimestamp) {
    res.status(400).json({ error: 'targetTimestamp required' })
    return
  }

  try {
    // Load changelog
    const raw = await fs.readFile(changelogFile(req.params.id), 'utf-8')
    const log: ChangelogEntry[] = JSON.parse(raw)

    // Find the entry at or before the target timestamp
    const idx = log.findIndex(e => e.timestamp === targetTimestamp)
    if (idx === -1) {
      res.status(404).json({ error: 'Changelog entry not found' })
      return
    }

    // Load current patient data
    const patientRaw = await fs.readFile(patientFile(req.params.id), 'utf-8')
    const patientData = JSON.parse(patientRaw)

    // Walk backwards through the changelog from the end to the target entry,
    // reversing each change
    for (let i = log.length - 1; i >= idx; i--) {
      for (const change of log[i].changes) {
        reverseChange(change, patientData)
      }
    }

    // Truncate changelog: remove entries from idx onward
    const newLog = log.slice(0, idx)
    await fs.writeFile(changelogFile(req.params.id), JSON.stringify(newLog, null, 2))

    await fs.writeFile(patientFile(req.params.id), JSON.stringify(patientData, null, 2))
    res.json({ ok: true, data: patientData })
  } catch (err) {
    res.status(500).json({ error: 'Restore failed', detail: String(err) })
  }
})

// Apply a single change in reverse to patient data
function reverseChange(change: ChangeEntry, patientData: any): void {
  switch (change.type) {
    case 'dose_added': {
      // Remove the added dose
      const plan = patientData.plans.find((p: any) => p.id === change.planId)
      if (plan) {
        plan.doses = plan.doses.filter((d: any) => d.id !== change.doseId)
      }
      break
    }
    case 'dose_removed': {
      // Need to re-add — but we don't have the full dose data in the changelog
      // This is a limitation; we skip this for now
      break
    }
    case 'dose_modified': {
      if (change.fields) {
        const plan = patientData.plans.find((p: any) => p.id === change.planId)
        if (plan) {
          const dose = plan.doses.find((d: any) => d.id === change.doseId)
          if (dose) {
            for (const [key, fieldChange] of Object.entries(change.fields)) {
              dose[key] = fieldChange.old
            }
          }
        }
      }
      break
    }
    case 'plan_added': {
      patientData.plans = patientData.plans.filter((p: any) => p.id !== change.planId)
      break
    }
    case 'plan_removed': {
      // Can't fully reconstruct removed plan from changelog alone
      break
    }
    case 'plan_renamed': {
      if (change.fields?.name) {
        const plan = patientData.plans.find((p: any) => p.id === change.planId)
        if (plan) plan.name = change.fields.name.old
      }
      break
    }
    case 'params_changed': {
      if (change.fields) {
        const plan = patientData.plans.find((p: any) => p.id === change.planId)
        if (plan) {
          for (const [key, fieldChange] of Object.entries(change.fields)) {
            plan.pkParams[key] = fieldChange.old
          }
        }
      }
      break
    }
    case 'active_plan_changed': {
      if (change.fields?.planId && change.planType) {
        patientData.activePlanIds[change.planType] = change.fields.planId.old
      }
      break
    }
    case 'starting_weight_changed': {
      if (change.fields?.startingWeightLbs) {
        const plan = patientData.plans.find((p: any) => p.id === change.planId)
        if (plan) plan.startingWeightLbs = change.fields.startingWeightLbs.old
      }
      break
    }
    case 'patient_renamed': {
      if (change.fields?.name) {
        patientData.patient.name = change.fields.name.old
      }
      break
    }
  }
}

// SPA catch-all: serve index.html for non-API routes (production only)
try {
  await fs.access(path.join(DIST_DIR, 'index.html'))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
} catch {
  // dev mode — no catch-all needed
}

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
