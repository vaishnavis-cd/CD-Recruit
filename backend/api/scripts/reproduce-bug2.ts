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
  console.log("=== REPRODUCING BUG 2: SYSOPS DRIVE CREATION & LINK GENERATION ===");

  // 1. Get dev admin token
  const devTokenRes: any = await getJson("http://localhost:3001/api/v1/auth/dev-token");
  const devTokenData = JSON.parse(devTokenRes.body);
  const adminToken = devTokenData.token;

  // 2. Try creating a Drive for SysOps using roleTemplateId = "SYSOPS"
  console.log("\nStep 1: Creating Drive for roleTemplateId = 'SYSOPS'...");
  const createDriveRes: any = await postJson(
    "http://localhost:3001/api/v1/admin/drives",
    {
      name: "SysOps Test Drive",
      roleTemplateId: "SYSOPS",
      status: "DRAFT",
    },
    adminToken
  );
  console.log("Create Drive Response Status:", createDriveRes.statusCode);
  console.log("Create Drive Response Body:", createDriveRes.body);

  const driveData = JSON.parse(createDriveRes.body);
  const driveId = driveData.driveId;

  if (driveId) {
    // 3. Add Candidate Roster
    console.log("\nStep 2: Adding Candidate Roster...");
    const addCandRes: any = await postJson(
      `http://localhost:3001/api/v1/admin/drives/${driveId}/candidates/bulk`,
      {
        candidates: [{ name: "SysOps Candidate", candidateEmail: "sysops.cand@example.com" }],
      },
      adminToken
    );
    console.log("Add Candidate Response Status:", addCandRes.statusCode);
    console.log("Add Candidate Response Body:", addCandRes.body);

    // 4. Generate Links
    console.log("\nStep 3: Generating Links...");
    const genLinksRes: any = await postJson(
      `http://localhost:3001/api/v1/admin/drives/${driveId}/generate-links`,
      {},
      adminToken
    );
    console.log("Generate Links Response Status:", genLinksRes.statusCode);
    console.log("Generate Links Response Body:", genLinksRes.body);

    // 5. Fetch Invites
    console.log("\nStep 4: Fetching Invites...");
    const invitesRes: any = await getJson(`http://localhost:3001/api/v1/admin/invites?driveId=${driveId}`, adminToken);
    console.log("Fetch Invites Response Status:", invitesRes.statusCode);
    console.log("Fetch Invites Response Body:", invitesRes.body);

    const invite = JSON.parse(invitesRes.body).items?.[0];
    if (invite?.token) {
      // 6. Attempting Candidate Session Start
      console.log("\nStep 5: Starting Candidate Session with invite token...");
      const sessionStartRes: any = await postJson("http://localhost:3001/api/v1/sessions/start", {
        inviteToken: invite.token,
      });
      console.log("Session Start Status:", sessionStartRes.statusCode);
      console.log("Session Start Body:", sessionStartRes.body);
    }
  }
}

run();
