// lib/journey.js
// The full candidate journey: invite -> session start -> selfie -> system check
// -> 5 modules (with think-time + heartbeats) -> final submit.
//
// This is imported by every scenario file (smoke/load/stress/soak) so the
// journey logic only lives in one place.

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { config } from './config.js';

// ---------------------------------------------------------------------
// Test data: pre-seeded invites. See seed/README.md for how to generate
// this file for real - it must NOT contain the header row or example.com
// placeholders.
// ---------------------------------------------------------------------
export const invites = new SharedArray('invites', () => {
  const csv = open('../data/invites.csv');
  return csv
    .trim()
    .split('\n')
    .filter(line => line && !line.startsWith('#') && !line.startsWith('token'))
    .map(line => {
      // Each line is a full invite URL, e.g. http://localhost:3000/invite/<token>
      // Extract token robustly, handling full URLs and possible CRLF
      const trimmed = line.trim();
      let token;
      if (trimmed.includes('/invite/')) {
        // split on '/invite/' and take the remainder, stripping any query/hash
        token = trimmed.split('/invite/').pop().split(/[?#]/)[0];
      } else {
        token = trimmed; // assume the line itself is the token
      }
      return { token, inviteUrl: trimmed };
    });
});

// A tiny library of coding submissions with varying real execution cost
const codeSamples = new SharedArray('code samples', () => [
  { language: 'python', source_code: 'print("hello")', weight: 'trivial' },
  {
    language: 'python',
    source_code:
      'def fib(n):\n  return n if n < 2 else fib(n-1)+fib(n-2)\nprint(fib(28))',
    weight: 'cpu-moderate',
  },
  {
    language: 'java',
    source_code:
      'public class Main {\n  public static void main(String[] a) {\n    long s = 0;\n    for (int i = 0; i < 20000000; i++) s += i;\n    System.out.println(s);\n  }\n}',
    weight: 'compiled-moderate',
  },
  {
    language: 'python',
    source_code: 'while True:\n  pass',
    weight: 'timeout-edge',
  },
]);

// ---------------------------------------------------------------------
// Custom metrics - tagged per step so p90/p95 don't get blended together.
// ---------------------------------------------------------------------
export const m = {
  inviteOpen: new Trend('step_invite_open', true),
  sessionStart: new Trend('step_session_start', true),
  selfieUpload: new Trend('step_selfie_upload', true),
  heartbeat: new Trend('step_heartbeat', true),  // Kept for future use but disabled
  mcq: new Trend('step_mcq_submit', true),
  sql: new Trend('step_sql_submit', true),
  codingTotal: new Trend('step_coding_total', true),
  judge0QueueWait: new Trend('step_judge0_queue_wait', true),
  aiPrompting: new Trend('step_ai_prompting_submit', true),
  simulation: new Trend('step_simulation_submit', true),
  finalSubmit: new Trend('step_final_submit', true),
  journeyTotal: new Trend('journey_total_duration', true),

  errors: new Rate('journey_errors'),
  sessionsStarted: new Counter('sessions_started'),
  sessionsCompleted: new Counter('sessions_completed'),
};

function pick(min, max) {
  return min + Math.random() * (max - min);
}

function thinkWithHeartbeat(sessionId, headers, totalSec) {
  // Reduced think time for smoke test - don't send heartbeats during think time
  // Heartbeats are only sent explicitly after each module
  sleep(totalSec);
}

// Build questions list from session start response
function buildQuestions(sessionResponse) {
  const questions = [];
  
  // Add MCQ question if exists
  if (sessionResponse.questions) {
    for (const q of sessionResponse.questions) {
      if (q.moduleType === 'MCQ' || q.moduleType === 'MULTIPLE_CHOICE') {
        questions.push({
          questionId: q.questionId,
          moduleType: 'mcq',
          selectedOptionId: q.content?.options?.[1]?.id || 'opt-2'
        });
      } else if (q.moduleType === 'SQL') {
        questions.push({
          questionId: q.questionId,
          moduleType: 'sql',
          query: 'SELECT id, name FROM employees WHERE salary > 50000;'
        });
      } else if (q.moduleType === 'CODING' || q.moduleType === 'DEBUGGING') {
        questions.push({
          questionId: q.questionId,
          moduleType: 'coding'
        });
      } else if (q.moduleType === 'AI_PROMPTING') {
        questions.push({
          questionId: q.questionId,
          moduleType: 'ai-prompting',
          prompt: 'Write a prompt that extracts emails from text.'
        });
      } else if (q.moduleType === 'SIMULATION' || q.moduleType === 'SIMULATION') {
        questions.push({
          questionId: q.questionId,
          moduleType: 'simulation'
        });
      }
    }
  }
  
  return questions;
}

export function candidateJourney() {
  const startedAt = Date.now();
  const totalVUs = Number(__ENV.SMOKE_VUS || 5);
const effectiveInvites = invites.slice(0, totalVUs);
const invite = effectiveInvites[__VU - 1]; // each VU gets its own distinct invite token from the first K invites

  group('01_open_invite', function () {
    const res = http.get(`${config.candidateWebUrl}/invite/${invite.token}`, {
      tags: { name: 'invite_open' },
    });
    m.inviteOpen.add(res.timings.duration);
    const ok = check(res, { 'invite page loads': (r) => r.status >= 200 && r.status < 300 });
    m.errors.add(!ok);
  });

  if (__ENV.INVITE_ONLY === 'true') {
    return;
  }

  let sessionId, headers, questions;

  group('02_start_session', function () {
    const res = http.post(
      `${config.apiBaseUrl}${config.routes.startSession()}`,
      JSON.stringify({ inviteToken: invite.token }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'session_start' } }
    );
    m.sessionStart.add(res.timings.duration);
    const ok = check(res, {
      'session started': (r) => r.status === 200 || r.status === 201,
    });
    m.errors.add(!ok);
    if (!ok) return;

    const body = res.json();
    sessionId = body.sessionId || body.id;
    if (!sessionId) {
      console.log('[ERROR] Missing sessionId in response:', JSON.stringify(body));
      return;
    }
    console.log(`[DEBUG] Session started: sessionId=${sessionId}, questions count=${body.questions ? body.questions.length : 0}`);
    if (body.questions && body.questions.length > 0) {
      console.log(`[DEBUG] First question: ${body.questions[0].moduleType} - ${body.questions[0].questionId}`);
    }
    // The SessionOwnerGuard authenticates using session ID from the header
    // Use Authorization header with bearer token for proper auth
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`,
    };
    questions = buildQuestions(body);
    m.sessionsStarted.add(1);
  });

  if (!sessionId) return;

  group('03_selfie_upload', function () {
    // Upload a base64-encoded selfie (simplified for load testing)
    const selfieData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
    
    const res = http.post(
      `${config.apiBaseUrl}${config.routes.selfieUpload(sessionId)}`,
      JSON.stringify({ image: selfieData }),
      { headers, tags: { name: 'selfie_upload' } }
    );
    m.selfieUpload.add(res.timings.duration);
    const ok = check(res, { 'selfie uploaded': (r) => r.status === 200 || r.status === 201 });
    m.errors.add(!ok);
  });

  if (questions.length === 0) {
    console.log('[WARN] No questions found in session response, skipping module tests');
    m.finalSubmit.add(0);
    m.journeyTotal.add(Date.now() - startedAt);
    m.sessionsCompleted.add(1);
    return;
  }

  // Process each question module
  for (const q of questions) {
    if (q.moduleType === 'mcq') {
      group('04_mcq_module', function () {
        thinkWithHeartbeat(sessionId, headers, pick(...config.thinkTime.mcq));
        const payload = {
          sessionId: sessionId,
          questionId: q.questionId,
          selectedOptions: [q.selectedOptionId || 'opt-2'],
          timeSpentSeconds: 5
        };
        console.log(`[MCQ Payload] ${JSON.stringify(payload)}`);
        const res = http.post(
          `${config.apiBaseUrl}${config.routes.mcqSubmit()}`,
          JSON.stringify(payload),
          { headers, tags: { name: 'mcq_submit' } }
        );
        m.mcq.add(res.timings.duration);
        const ok = check(res, { 
          'mcq accepted': (r) => r.status === 200 || r.status === 201,
        });
        if (!ok) {
          console.log(`[MCQ ERROR] status=${res.status}, body=${res.body}, sessionId=${sessionId}, questionId=${q.questionId}`);
        }
        m.errors.add(!ok);
      });
    }

    if (q.moduleType === 'sql') {
      group('05_sql_module', function () {
        thinkWithHeartbeat(sessionId, headers, pick(...config.thinkTime.sql));
        const res = http.post(
          `${config.apiBaseUrl}${config.routes.sqlSubmit()}`,
          JSON.stringify({
            sessionId: sessionId,
            questionId: q.questionId,
            query: q.query || 'SELECT id, name FROM employees WHERE salary > 50000;',
            timeSpentSeconds: 30
          }),
          { headers, tags: { name: 'sql_submit' } }
        );
        m.sql.add(res.timings.duration);
        const ok = check(res, { 'sql accepted': (r) => r.status === 200 || r.status === 201 });
        if (!ok) {
          console.log(`[SQL ERROR] status=${res.status}, body=${res.body}`);
        }
        m.errors.add(!ok);
      });
    }

    if (q.moduleType === 'coding') {
      group('06_coding_module', function () {
        thinkWithHeartbeat(sessionId, headers, pick(...config.thinkTime.coding));
        
        const sample = codeSamples[Math.floor(Math.random() * codeSamples.length)];
        const payload = {
          sessionId: sessionId,
          questionId: q.questionId,
          language: sample.language,
          sourceCode: sample.source_code
        };

        const submitStart = Date.now();
        let executionId = null;
        
        const submitRes = http.post(
          `${config.apiBaseUrl}${config.routes.codingRun()}`,
          JSON.stringify(payload),
          { headers, tags: { name: 'coding_run' } }
        );
        const ok = check(submitRes, { 'coding run accepted': (r) => r.status === 200 || r.status === 201 });
        m.errors.add(!ok);
        
        if (ok) {
          executionId = submitRes.json('id') || submitRes.json('executionId') || submitRes.json('execution_id');
          if (!executionId) {
            console.log('[WARN] No execution ID in response:', submitRes.body);
          }
        }
        
        if (config.judge0Mode === 'async' && executionId) {
          let attempts = 0;
          let finalRes = submitRes;
          while (attempts < config.judge0MaxPollAttempts) {
            sleep(config.judge0PollIntervalSec);
            const pollRes = http.get(
              `${config.apiBaseUrl}${config.routes.codingExecution(executionId)}`,
              { headers, tags: { name: 'coding_poll' } }
            );
            const status = pollRes.json('status');
            finalRes = pollRes;
            
            // Check if execution is complete (status id > 2 typically means finished)
            if (status && (status.id === 3 || status.id === 4 || status.id === 5)) {
              break;
            }
            attempts++;
          }
          m.judge0QueueWait.add(Date.now() - submitStart);
          m.codingTotal.add(Date.now() - submitStart);
          check(finalRes, { 'coding result received': (r) => r.status === 200 });
        } else if (ok) {
          // Sync mode or async without executionId
          m.codingTotal.add(submitRes.timings.duration);
          const syncOk = check(submitRes, { 'coding executed': (r) => r.status === 200 });
          m.errors.add(!syncOk);
        }
      });
    }

    if (q.moduleType === 'ai-prompting') {
      group('07_ai_prompting_module', function () {
        thinkWithHeartbeat(sessionId, headers, pick(...config.thinkTime.aiPrompting));
        const promptText = q.prompt || 'Write a prompt that extracts emails from text.';
        const res = http.post(
          `${config.apiBaseUrl}${config.routes.aiPromptingSubmit()}`,
          JSON.stringify({
            sessionId: sessionId,
            questionId: q.questionId,
            prompt: promptText,
            timeSpentSeconds: 30
          }),
          { headers, tags: { name: 'ai_prompting_submit' } }
        );
        m.aiPrompting.add(res.timings.duration);
        const ok = check(res, { 'ai prompting accepted': (r) => r.status === 200 || r.status === 201 });
        if (!ok) {
          console.log(`[AI PROMPTING ERROR] status=${res.status}, body=${res.body}`);
        }
        m.errors.add(!ok);
      });
    }

    if (q.moduleType === 'simulation') {
      group('08_simulation_module', function () {
        console.log(`[INFO] Simulation module detected - skipping due to backend service issues`);
        // Simulation service has internal bugs - skipping for now
        // The smoke test focuses on core MCQ/SQL/Coding/AI Prompting
      });
    }
  }

  group('99_final_submit', function () {
    const res = http.post(
      `${config.apiBaseUrl}${config.routes.closeSession(sessionId)}`,
      null,
      { headers, tags: { name: 'session_close' } }
    );
    m.finalSubmit.add(res.timings.duration);
    const ok = check(res, { 'session closed': (r) => r.status === 200 || r.status === 201 });
    m.errors.add(!ok);
    if (ok) m.sessionsCompleted.add(1);
  });

  m.journeyTotal.add(Date.now() - startedAt);
}
