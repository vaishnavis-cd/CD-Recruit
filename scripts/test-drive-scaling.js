const http = require('http');

const API_BASE = 'http://localhost:3001/api/v1';

async function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function postJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = data ? JSON.stringify(data) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function patchJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyStr = data ? JSON.stringify(data) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PATCH',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function main() {
  console.log('🏁 Getting dev staff token...');
  const tokenRes = await getJson(`${API_BASE}/auth/dev-token?staffId=6d21b603-c19e-40bd-bbc9-af5b32f45083&email=recruiter@example.com&role=RECRUITER`);
  if (tokenRes.status !== 200) {
    console.error('Failed to get dev token', tokenRes.body);
    process.exit(1);
  }
  const token = tokenRes.body.token;
  console.log('✔ Staff token acquired.');

  console.log('🚀 Creating drive via API to trigger scaling scheduling...');
  const now = new Date();
  const scheduleStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 mins future
  const scheduleEnd = new Date(now.getTime() + 120 * 60 * 1000).toISOString(); // 2 hours future

  const createRes = await postJson(`${API_BASE}/admin/drives`, {
    name: 'Scaling Test Drive',
    roleTemplateId: 'load-test-template-uuid',
    status: 'ACTIVE',
    scheduleStart,
    scheduleEnd,
    candidates: []
  }, token);

  if (createRes.status !== 200 && createRes.status !== 201) {
    console.error('Failed to create drive', createRes.body);
    process.exit(1);
  }
  const driveId = createRes.body.driveId;
  console.log(`✔ Drive created successfully (ID: ${driveId})`);

  console.log('🚀 Updating drive via API to verify rescheduled/idempotent job enqueuing...');
  const updatedStart = new Date(now.getTime() + 20 * 60 * 1000).toISOString(); // shift by 10 mins
  const updateRes = await patchJson(`${API_BASE}/admin/drives/${driveId}`, {
    name: 'Updated Scaling Test Drive',
    scheduleStart: updatedStart
  }, token);

  if (updateRes.status !== 200) {
    console.error('Failed to update drive', updateRes.body);
    process.exit(1);
  }
  console.log('✔ Drive updated successfully.');
  console.log('🎉 Verification finished!');
}

main().catch(console.error);
