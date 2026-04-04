import express from 'express'
import cors from 'cors'
import fs from 'fs/promises'
import path from 'path'

const app = express()
const PORT = 3001
const DATA_DIR = path.resolve(import.meta.dirname, '..', 'data')

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// Ensure data directory exists
await fs.mkdir(DATA_DIR, { recursive: true })

function patientFile(id: string): string {
  // Sanitize id to prevent directory traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(DATA_DIR, `${safeId}.json`)
}

// List all patients (just id + name, not full data)
app.get('/api/patients', async (_req, res) => {
  const files = await fs.readdir(DATA_DIR)
  const patients = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
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

// Save/update patient data
app.put('/api/patients/:id', async (req, res) => {
  const data = req.body
  if (!data.patient || !data.plans || !data.activePlanIds) {
    res.status(400).json({ error: 'Invalid patient data' })
    return
  }
  await fs.writeFile(patientFile(req.params.id), JSON.stringify(data, null, 2))
  res.json({ ok: true })
})

// Delete patient
app.delete('/api/patients/:id', async (req, res) => {
  try {
    await fs.unlink(patientFile(req.params.id))
  } catch {
    // already gone
  }
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
