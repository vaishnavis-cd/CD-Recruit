import http from "http";

function checkUrl(urlStr: string): Promise<string> {
  return new Promise((resolve) => {
    http
      .get(urlStr, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(`HTTP ${res.statusCode} -> Redirect to ${res.headers.location}`);
        } else {
          resolve(`HTTP ${res.statusCode}`);
        }
      })
      .on("error", (err) => resolve(`ERROR: ${err.message}`));
  });
}

async function run() {
  console.log("=== VERIFYING ALL SERVICES & PORTS ===");
  console.log("Candidate Web (Port 5173):", await checkUrl("http://localhost:5173/"));
  console.log("Admin Web (Port 5174):", await checkUrl("http://localhost:5174/"));
  console.log("Backend API (Port 3001):", await checkUrl("http://localhost:3001/api/v1/health"));
}

run();
