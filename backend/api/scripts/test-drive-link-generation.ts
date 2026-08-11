import http from "http";

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
  console.log("=== TESTING DRIVE CREATION -> LINK GENERATION -> CANDIDATE SESSION ===");

  // 1. Get dev admin token
  const devTokenRes: any = await getJson("http://localhost:3001/api/v1/auth/dev-token");
  console.log("1. Dev Token Status:", devTokenRes.statusCode);
  const devTokenData = JSON.parse(devTokenRes.body);
  const adminToken = devTokenData.token;

  // 2. Get role template ID
  const roleTemplatesRes: any = await getJson("http://localhost:3001/api/v1/admin/role-templates", adminToken);
  const roleTemplates = JSON.parse(roleTemplatesRes.body);
  const roleTemplateId = roleTemplates[0]?.id;
  console.log("2. Using RoleTemplateId:", roleTemplateId);

  // 3. Create a Drive
  const createDriveRes: any = await postJson(
    "http://localhost:3001/api/v1/admin/drives",
    {
      name: "SECOPS Candidate Verification Drive",
      roleTemplateId,
    },
    adminToken
  );
  console.log("3. Create Drive Status:", createDriveRes.statusCode);
  const driveData = JSON.parse(createDriveRes.body);
  const driveId = driveData.driveId;
  console.log("   Drive ID:", driveId);

  // 4. Add Candidate Roster
  const addCandidateRes: any = await postJson(
    `http://localhost:3001/api/v1/admin/drives/${driveId}/candidates/bulk`,
    {
      candidates: [
        { name: "John Doe Candidate", candidateEmail: "john.doe@example.com" },
      ],
    },
    adminToken
  );
  console.log("4. Add Candidates Status:", addCandidateRes.statusCode);

  // 5. Generate Links
  const genLinksRes: any = await postJson(
    `http://localhost:3001/api/v1/admin/drives/${driveId}/generate-links`,
    {},
    adminToken
  );
  console.log("5. Generate Links Status:", genLinksRes.statusCode, "Body:", genLinksRes.body);

  // 6. Fetch Invites to get generated link token
  const invitesRes: any = await getJson(`http://localhost:3001/api/v1/admin/invites?driveId=${driveId}`, adminToken);
  const invitesData = JSON.parse(invitesRes.body);
  const generatedInvite = invitesData.items[0];
  console.log("6. Generated Invite Token:", generatedInvite.token ? "PRESENT" : "MISSING");
  console.log("   Full Token:", generatedInvite.token);

  // 7. Verify Candidate Link URL format
  const candidateUrl = `http://localhost:5173/start?token=${generatedInvite.token}`;
  console.log("7. Candidate Copied Link URL:", candidateUrl);

  // 8. Start Candidate Session using this token
  const candidateStartRes: any = await postJson("http://localhost:3001/api/v1/sessions/start", {
    inviteToken: generatedInvite.token,
  });
  console.log("8. Candidate Session Start Status:", candidateStartRes.statusCode);
  const candidateStartData = JSON.parse(candidateStartRes.body);
  console.log("   Session ID:", candidateStartData.sessionId);
  console.log("   Questions Count:", candidateStartData.questions?.length);

  if (candidateStartRes.statusCode === 200 && candidateStartData.sessionId) {
    console.log("\n✅ E2E DRIVE CREATION -> GENERATE LINK -> CANDIDATE SESSION VERIFIED SUCCESSFULLY!");
  } else {
    console.log("\n❌ FAILED TO START CANDIDATE SESSION FROM GENERATED LINK!");
  }
}

run();
