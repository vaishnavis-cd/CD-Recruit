// mock-services/ai-grading-stub/server.js
//
// Zero-dependency stub server for load-test runs. It mimics just enough of
// the Anthropic Messages API shape (and a generic KYC-vendor "verify" call)
// to satisfy your correlation-engine / KYC client without making real,
// billed, rate-limited calls during a 1000-VU test.
//
// HOW TO ACTUALLY USE THIS (the part that depends on your codebase):
// Point whichever client makes these calls at this server for the
// duration of the test. The mechanism depends on how that client is
// built:
//   - If it reads a base URL from env (e.g. ANTHROPIC_BASE_URL,
//     GROQ_BASE_URL, or a custom CORRELATION_ENGINE_LLM_BASE_URL),
//     set that env var to http://localhost:4500 (or wherever this runs)
//     before starting the correlation-engine for the test.
//   - If the base URL is hardcoded in the SDK client construction, you'll
//     need a one-line change (most Anthropic/Groq SDKs accept a
//     `baseURL` constructor option already - check backend/correlation-engine).
//   - If BullMQ grading jobs are processed by a worker, restart that
//     worker with the redirected env var before the test run, and switch
//     it back afterward - do NOT leave production grading pointed at a
//     stub outside of test windows.
//
// Run: node mock-services/ai-grading-stub/server.js
// Default port: 4500 (override with PORT env var)

const http = require('http');

const PORT = process.env.PORT || 4500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Simulate a realistic-ish but bounded response time so you're still
  // exercising the correlation-engine's async/await and timeout handling,
  // just without real LLM latency variance or cost.
  await delay(150 + Math.random() * 350);

  res.setHeader('Content-Type', 'application/json');

  if (req.url.startsWith('/v1/messages')) {
    // Anthropic Messages API shape
    await jsonBody(req);
    res.writeHead(200);
    res.end(
      JSON.stringify({
        id: `msg_stub_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-stub',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              score: 8,
              feedback: 'Stubbed grading response for load testing.',
              rubric: { correctness: 8, clarity: 7, efficiency: 8 },
            }),
          },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 10 },
      })
    );
    return;
  }

  if (req.url.startsWith('/openai/v1/chat/completions')) {
    // Groq's OpenAI-compatible shape
    await jsonBody(req);
    res.writeHead(200);
    res.end(
      JSON.stringify({
        id: `chatcmpl-stub-${Date.now()}`,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ score: 8, feedback: 'Stubbed.' }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    );
    return;
  }

  if (req.url.startsWith('/kyc/verify')) {
    // Generic stand-in for a KYC/liveness vendor call
    await jsonBody(req);
    res.writeHead(200);
    res.end(
      JSON.stringify({
        verificationId: `kyc_stub_${Date.now()}`,
        status: 'PASSED',
        livenessScore: 0.97,
      })
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found in stub' }));
});

server.listen(PORT, () => {
  console.log(`AI-grading / KYC stub listening on :${PORT}`);
  console.log('Routes: POST /v1/messages, POST /openai/v1/chat/completions, POST /kyc/verify');
});
