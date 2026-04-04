import type { PatientData } from '../types'

const API_BASE = '/api'

export async function fetchPatientList(): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  const res = await fetch(`${API_BASE}/patients`)
  if (!res.ok) throw new Error('Failed to fetch patients')
  return res.json()
}

export async function fetchPatientData(id: string): Promise<PatientData> {
  const res = await fetch(`${API_BASE}/patients/${id}`)
  if (!res.ok) throw new Error('Patient not found')
  return res.json()
}

export async function savePatientData(data: PatientData): Promise<void> {
  const res = await fetch(`${API_BASE}/patients/${data.patient.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save patient')
}

export async function deletePatientData(id: string): Promise<void> {
  await fetch(`${API_BASE}/patients/${id}`, { method: 'DELETE' })
}
