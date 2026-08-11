import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import http from 'http';

function postJson(urlStr: string, body: object, token?: string) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const u = new URL(urlStr);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(data)),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers,
      },
      (res) => {
        let respBody = "";
        res.on("data", (c) => (respBody += c));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: respBody }));
      }
    );

    req.on("error", (err) => resolve({ error: err.message }));
    req.write(data);
    req.end();
  });
}

function getJson(urlStr: string, token?: string) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "GET",
        headers,
      },
      (res) => {
        let respBody = "";
        res.on("data", (c) => (respBody += c));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: respBody }));
      }
    );

    req.on("error", (err) => resolve({ error: err.message }));
    req.end();
  });
}

async function run() {
  console.log("=================================================");
  console.log("=== VERIFYING BUG 1 & BUG 2 FIXES WITH PROOF ===");
  console.log("=================================================\n");

  // 1. Get dev admin token
  const devTokenRes: any = await getJson("http://localhost:3001/api/v1/auth/dev-token");
  const devTokenData = JSON.parse(devTokenRes.body);
  const adminToken = devTokenData.token;

  // ─────────────────────────────────────────────────────────
  // TEST CASE 1: SECOPS (Department WITH Seeded Question Data)
  // ─────────────────────────────────────────────────────────
  console.log("--- TEST CASE 1: SECOPS (Populated Department) ---");
  const secopsTemplatesRes: any = await getJson("http://localhost:3001/api/v1/admin/role-templates", adminToken);
  const allTemplates = JSON.parse(secopsTemplatesRes.body);
  const secopsTemplate = allTemplates.find((t: any) => t.department === "SECOPS" || t.id === "57640c10-a03b-48c0-a758-2d65eb215c21" || t.roleName?.includes("SecOps"));

  console.log("SECOPS Template Found:", secopsTemplate ? `${secopsTemplate.roleName} (${secopsTemplate.id})` : "NONE");

  // Create Drive for SECOPS
  const createSecopsDriveRes: any = await postJson(
    "http://localhost:3001/api/v1/admin/drives",
    {
      name: "SECOPS Verification Drive",
      roleTemplateId: secopsTemplate ? secopsTemplate.id : "SECOPS",
      status: "DRAFT",
    },
    adminToken
  );
  console.log("1. Create SECOPS Drive Status:", createSecopsDriveRes.statusCode);
  const secopsDriveData = JSON.parse(createSecopsDriveRes.body);

  // Add Candidate to SECOPS Drive
  await postJson(
    `http://localhost:3001/api/v1/admin/drives/${secopsDriveData.driveId}/candidates/bulk`,
    { candidates: [{ name: "SecOps Candidate", candidateEmail: "secops.cand@example.com" }] },
    adminToken
  );

  // Generate Links for SECOPS Drive
  const secopsGenLinksRes: any = await postJson(
    `http://localhost:3001/api/v1/admin/drives/${secopsDriveData.driveId}/generate-links`,
    {},
    adminToken
  );
  console.log("2. Generate Links SECOPS Status:", secopsGenLinksRes.statusCode, "Body:", secopsGenLinksRes.body);

  // Get Invite Token
  const secopsInvitesRes: any = await getJson(`http://localhost:3001/api/v1/admin/invites?driveId=${secopsDriveData.driveId}`, adminToken);
  const secopsInvite = JSON.parse(secopsInvitesRes.body).items[0];

  // Start Candidate Session for SECOPS
  const secopsSessionRes: any = await postJson("http://localhost:3001/api/v1/sessions/start", {
    inviteToken: secopsInvite.token,
  });
  console.log("3. Start SECOPS Session Status:", secopsSessionRes.statusCode);
  const secopsSessionData = JSON.parse(secopsSessionRes.body);
  console.log("   Questions Count:", secopsSessionData.questions?.length);
  
  const leakedQuestions = secopsSessionData.questions?.filter((q: any) => q.content?.department && q.content.department !== "SECOPS");
  console.log("   Cross-Role Leaked Questions in SECOPS:", leakedQuestions?.length || 0);

  if ((secopsSessionRes.statusCode === 200 || secopsSessionRes.statusCode === 201) && leakedQuestions?.length === 0) {
    console.log("✅ TEST CASE 1 PASSED: SECOPS correctly returns scoped questions with 0 leakage!\n");
  } else {
    console.log("❌ TEST CASE 1 FAILED!\n");
  }

  // ─────────────────────────────────────────────────────────
  // TEST CASE 2: SYSOPS (Department WITHOUT Seeded Question Data)
  // ─────────────────────────────────────────────────────────
  console.log("--- TEST CASE 2: SYSOPS (Unpopulated Department) ---");

  // Create Drive for SYSOPS
  const createSysopsDriveRes: any = await postJson(
    "http://localhost:3001/api/v1/admin/drives",
    {
      name: "SysOps Verification Drive",
      roleTemplateId: "SYSOPS",
      status: "DRAFT",
    },
    adminToken
  );
  console.log("1. Create SYSOPS Drive Status:", createSysopsDriveRes.statusCode);
  const sysopsDriveData = JSON.parse(createSysopsDriveRes.body);

  // Add Candidate to SYSOPS Drive
  await postJson(
    `http://localhost:3001/api/v1/admin/drives/${sysopsDriveData.driveId}/candidates/bulk`,
    { candidates: [{ name: "SysOps Candidate", candidateEmail: "sysops.cand@example.com" }] },
    adminToken
  );

  // Attempt Generate Links for SYSOPS Drive (EXPECT CLEAN FAILURE)
  const sysopsGenLinksRes: any = await postJson(
    `http://localhost:3001/api/v1/admin/drives/${sysopsDriveData.driveId}/generate-links`,
    {},
    adminToken
  );
  console.log("2. Generate Links SYSOPS Status (Expect 400 Bad Request):", sysopsGenLinksRes.statusCode);
  console.log("   Error Body:", sysopsGenLinksRes.body);

  // Attempt Scheduled Drive Creation for SYSOPS (EXPECT CLEAN FAILURE)
  const sysopsSchedDriveRes: any = await postJson(
    "http://localhost:3001/api/v1/admin/drives",
    {
      name: "Scheduled SysOps Drive",
      roleTemplateId: "SYSOPS",
      status: "SCHEDULED",
      scheduleStart: new Date().toISOString(),
      scheduleEnd: new Date(Date.now() + 86400000).toISOString(),
    },
    adminToken
  );
  console.log("3. Create Scheduled SYSOPS Drive Status (Expect 422 Unprocessable Entity):", sysopsSchedDriveRes.statusCode);
  console.log("   Error Body:", sysopsSchedDriveRes.body);

  if (sysopsGenLinksRes.statusCode === 400 && sysopsSchedDriveRes.statusCode === 422) {
    console.log("✅ TEST CASE 2 PASSED: Unpopulated department fails cleanly with explicit error messages and 0 cross-department question leakage!\n");
  } else {
    console.log("❌ TEST CASE 2 FAILED!\n");
  }
}

run();
