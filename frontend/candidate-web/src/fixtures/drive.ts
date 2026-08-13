import type { Drive } from '../services/session-api/port'

export const FIXTURE_DRIVE: Drive = {
  id: 'drive-001',
  name: 'Senior Engineer Cohort — Q3 2024',
  roleName: 'Senior Software Engineer',
  status: 'open',
  scheduleStart: undefined as any,
  scheduleEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
}
