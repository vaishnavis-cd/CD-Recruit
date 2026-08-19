import http from 'http';

async function request(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('       PROCTORA PHASE 1 UNIFIED MONOLITH VERIFICATION          ');
  console.log('================================================================\n');

  const tests = [
    {
      name: '1. Candidate Web Landing SPA (GET /)',
      options: { host: 'localhost', port: 80, path: '/', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200 && res.data.includes('html');
        const coep = res.headers['cross-origin-embedder-policy']?.includes('credentialless');
        const coop = res.headers['cross-origin-opener-policy']?.includes('same-origin');
        const corp = res.headers['cross-origin-resource-policy']?.includes('cross-origin');
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [COEP Header] ${res.headers['cross-origin-embedder-policy']} -> Valid: ${Boolean(coep)}`);
        console.log(`   [COOP Header] ${res.headers['cross-origin-opener-policy']} -> Valid: ${Boolean(coop)}`);
        console.log(`   [CORP Header] ${res.headers['cross-origin-resource-policy']} -> Valid: ${Boolean(corp)}`);
        return ok && coep && coop && corp;
      }
    },
    {
      name: '2. Admin Web Gateway Normalization (GET /admin)',
      options: { host: 'localhost', port: 80, path: '/admin', method: 'GET' },
      validate: (res) => {
        const is301 = res.statusCode === 301;
        const target = res.headers['location']?.endsWith('/admin/');
        console.log(`   [HTTP Status] ${res.statusCode} (Expected: 301)`);
        console.log(`   [Location Header] ${res.headers['location']}`);
        return is301 && target;
      }
    },
    {
      name: '3. Admin Web SSR Initializer (GET /admin/)',
      options: { host: 'localhost', port: 80, path: '/admin/', method: 'GET' },
      validate: (res) => {
        const isRedirect = res.statusCode === 307 || res.statusCode === 200;
        const loc = res.headers['location'];
        console.log(`   [HTTP Status] ${res.statusCode}`);
        console.log(`   [Redirect target] ${loc || 'Direct Render'}`);
        return isRedirect;
      }
    },
    {
      name: '4. Admin Web Dashboard View (GET /admin/dashboard)',
      options: { host: 'localhost', port: 80, path: '/admin/dashboard', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200 && res.data.includes('<html');
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [Rendered HTML bytes] ${res.data.length} bytes`);
        return ok;
      }
    },
    {
      name: '5. Admin Web Static Assets (GET /admin/Logo.png)',
      options: { host: 'localhost', port: 80, path: '/admin/Logo.png', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200 && res.headers['content-type']?.includes('image/png');
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [Content-Type] ${res.headers['content-type']}`);
        return ok;
      }
    },
    {
      name: '6. NestJS Core API Health (GET /api/v1/health)',
      options: { host: 'localhost', port: 80, path: '/api/v1/health', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200;
        const parsed = JSON.parse(res.data);
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [Database Connectivity] ${parsed.database}`);
        console.log(`   [Storage Connectivity] ${parsed.storage}`);
        console.log(`   [Infra Mode] ${parsed.infraMode}`);
        return ok && parsed.database === 'connected' && parsed.storage === 'connected';
      }
    },
    {
      name: '7. NestJS Swagger API Documentation (GET /api-docs)',
      options: { host: 'localhost', port: 80, path: '/api-docs', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302;
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        return ok;
      }
    },
    {
      name: '8. MinIO S3 Object Storage API (Port 9000)',
      options: { host: 'localhost', port: 9000, path: '/minio/health/live', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200;
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        return ok;
      }
    },
    {
      name: '9. Judge0 Code Sandbox API (Port 2358)',
      options: { host: 'localhost', port: 2358, path: '/about', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200;
        const info = JSON.parse(res.data);
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [Judge0 Version] ${info.version}`);
        return ok && Boolean(info.version);
      }
    },
    {
      name: '10. Keycloak OIDC Realm Endpoint (Port 8080)',
      options: { host: 'localhost', port: 8080, path: '/realms/master/.well-known/openid-configuration', method: 'GET' },
      validate: (res) => {
        const ok = res.statusCode === 200;
        const parsed = JSON.parse(res.data);
        console.log(`   [HTTP Status] ${res.statusCode} OK`);
        console.log(`   [Issuer] ${parsed.issuer}`);
        return ok && Boolean(parsed.issuer);
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n▶ Running: ${test.name}`);
    try {
      const res = await request(test.options);
      const result = test.validate(res);
      if (result) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        failed++;
      }
    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n================================================================');
  console.log(`   SUMMARY: ${passed} of ${tests.length} tests passed (${Math.round((passed / tests.length) * 100)}%)`);
  console.log('================================================================');
}

runTests();
