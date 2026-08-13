import http from "http";

function fetchDetailed(urlStr: string) {
  return new Promise((resolve) => {
    const req = http.get(urlStr, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body.substring(0, 300),
        });
      });
    });

    req.on("error", (err) => {
      resolve({ error: err.message });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ error: "Connection Timeout (5s)" });
    });
  });
}

async function run() {
  console.log("=== TESTING API ENDPOINTS (PORT 3000) ===");
  console.log("Root /:", await fetchDetailed("http://127.0.0.1:3000/"));
  console.log("Root localhost /:", await fetchDetailed("http://localhost:3000/"));
  console.log("/api:", await fetchDetailed("http://localhost:3000/api"));
  console.log("/health:", await fetchDetailed("http://localhost:3000/health"));
  console.log("/api/health:", await fetchDetailed("http://localhost:3000/api/health"));
}

run();
