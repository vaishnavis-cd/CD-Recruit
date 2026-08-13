import { buildEvidenceKey, slugify, extractFirstName, formatReadableTimestamp } from './storage-key.util';
import * as assert from 'assert';

function runTests() {
  console.log('--- Running StorageKeyUtil Organized Filename Tests ---');

  // 1. First Name extraction & Timestamp formatting
  assert.strictEqual(extractFirstName('Priya Sharma'), 'Priya');
  assert.strictEqual(formatReadableTimestamp(new Date('2026-07-23T09:16:01.000Z')), '2026-07-23_09-16-01');
  console.log('✅ extractFirstName and formatReadableTimestamp tests passed');

  // 2. Normal slugify
  assert.strictEqual(slugify('Priya'), 'priya');
  console.log('✅ slugify test passed');

  // 3. Organized Filename buildEvidenceKey
  const key = buildEvidenceKey({
    clientSlug: 'acme-corp',
    candidateId: 'bf6201db-8721-473d-96c4-4b9f2fa1d65e',
    candidateName: 'Priya Sharma',
    sessionId: '0973d8a7-8721-473d-96c4-4b9f2fa1d65e',
    eventType: 'PHONE_DETECTED',
    eventId: 'evt_0973d8a7_phone_detected',
    timestamp: new Date('2026-07-23T09:16:01.000Z'),
  });

  const expectedKey = 'acme-corp/bf6201db_priya/phone-detected/2026-07-23_09-16-01_session-0973d8a7_event-0973d8a7.webm';
  assert.strictEqual(key, expectedKey);
  console.log('✅ Organized filename format test passed:', key);

  // 4. Fallbacks
  const fallbackKey = buildEvidenceKey({
    clientSlug: null,
    candidateId: 'cand-12345678',
    candidateName: null,
    sessionId: 'sess-99999999',
    eventType: 'LOOKING_AWAY',
    eventId: 'evt_55555555',
    timestamp: '2026-07-23T10:00:00.000Z',
  });

  assert.ok(fallbackKey.startsWith('default-org/cand-123_unnamed/looking-away/2026-07-23_10-00-00_session-sess-999_event-55555555.webm'));
  console.log('✅ Organized filename fallback key test passed:', fallbackKey);

  console.log('ALL STORAGE KEY UTIL ORGANIZED FILENAME TESTS PASSED! 🎉');
}

runTests();
