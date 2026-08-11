import http from "http";

function getUrl(urlStr: string): Promise<{ statusCode?: number; headers?: any; body: string; error?: string }> {
  return new Promise((resolve) => {
    http
      .get(urlStr, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      })
      .on("error", (err) => resolve({ error: err.message, body: "" }));
  });
}

async function run() {
  console.log("=== DIAGNOSING CANDIDATE WEB ===");

  const demoPage = await getUrl("http://127.0.0.1:5173/invite/demo");
  console.log("1. /invite/demo status:", demoPage.statusCode);

  const startRes: any = await getUrl("http://127.0.0.1:3001/api/v1/health");
  console.log("2. Backend API /health status:", startRes.statusCode, "Body:", startRes.body);
}

run();
