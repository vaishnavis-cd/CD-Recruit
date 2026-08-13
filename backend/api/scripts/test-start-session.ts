import http from "http";

function postJson(urlStr: string, body: object) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const u = new URL(urlStr);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
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

async function run() {
  console.log("=== TESTING DEMO / SESSIONS START ===");
  const res: any = await postJson("http://localhost:3001/api/v1/sessions/start", { inviteToken: "demo" });
  console.log("Status:", res.statusCode);
  console.log("Response:", res.body);
}

run();
