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
