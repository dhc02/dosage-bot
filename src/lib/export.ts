import type { PatientData } from '../types'

export function exportPatientData(data: PatientData): string {
  return JSON.stringify(data, null, 2)
}

export function importPatientData(json: string): PatientData {
  const parsed = JSON.parse(json)
  if (!parsed.patient || !parsed.plans || !parsed.activePlanIds) {
    throw new Error('Invalid patient data format')
  }
  return parsed as PatientData
}

export function downloadJson(data: PatientData, filename?: string) {
  const json = exportPatientData(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `${data.patient.name.replace(/\s+/g, '-').toLowerCase()}-data.json`
  a.click()
  URL.revokeObjectURL(url)
}
