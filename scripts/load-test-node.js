const http = require('http');

const API_BASE = 'http://localhost:3001/api/v1';

async function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = data ? JSON.stringify(data) : '';
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function runCandidate(id) {
  // Stagger start to avoid Throttler limits (rate limiter)
  await new Promise(resolve => setTimeout(resolve, id * 150));

  const token = `load-test-token-${id}`;
  try {
    // 1. Redeem invite token
    const startRes = await postJson(`${API_BASE}/sessions/start`, { inviteToken: token });
    if (startRes.status !== 200 && startRes.status !== 201) {
      console.error(`Candidate ${id} failed to start session: HTTP ${startRes.status}`, startRes.body);
      return;
    }
    const sessionId = startRes.body.sessionId;
    if (!sessionId) {
      console.error(`Candidate ${id} start response did not contain sessionId`, startRes.body);
      return;
    }

    // 2. Begin session
    const beginRes = await postJson(`${API_BASE}/sessions/${sessionId}/begin`, null);
    if (beginRes.status !== 200) {
      console.error(`Candidate ${id} failed to begin session ${sessionId}: HTTP ${beginRes.status}`, beginRes.body);
      return;
    }

    // 3. Submit code execution
    const runRes = await postJson(`${API_BASE}/coding/run`, {
      sessionId,
      questionId: '00000000-0000-4000-8000-000000000001',
      language: 'javascript',
      sourceCode: "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\nconsole.log(input.split(',').reduce((a,b)=>parseInt(a)+parseInt(b), 0));"
    });
    if (runRes.status !== 200 && runRes.status !== 201) {
      console.error(`Candidate ${id} failed to run code in session ${sessionId}: HTTP ${runRes.status}`, runRes.body);
      return;
    }

    console.log(`Candidate ${id} completed run successfully! Execution ID: ${runRes.body.executionId ?? 'N/A'}`);
  } catch (err) {
    console.error(`Candidate ${id} error:`, err.message);
  }
}

async function main() {
  const concurrency = 20; // run 20 concurrent candidates
  console.log(`🚀 Starting Node load test simulation with concurrency = ${concurrency}...`);
  
  const promises = [];
  for (let i = 1; i <= concurrency; i++) {
    promises.push(runCandidate(i));
  }

  await Promise.all(promises);
  console.log('✅ Load test simulation complete!');
}

main();
