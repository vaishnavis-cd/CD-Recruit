import type { Invite } from '../services/session-api/port'

// Fixture invite — token resolves against this; real adapter would hit the API
export const FIXTURE_INVITE: Invite = {
  token: 'demo-token-2024',
  scheduledTime: new Date(Date.now() + 25 * 60 * 1000).toISOString(), // T = 25 min from now (Buffer window by default)
  bufferMinutes: 30,
  graceMinutes: 20,
  candidateId: 'cand-001',
  driveId: 'drive-001',
}

// A second fixture for testing different time windows
export const FIXTURE_INVITE_TOO_EARLY: Invite = {
  token: 'demo-token-too-early',
  scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // T = 2h from now
  bufferMinutes: 30,
  graceMinutes: 20,
  candidateId: 'cand-001',
  driveId: 'drive-001',
}
