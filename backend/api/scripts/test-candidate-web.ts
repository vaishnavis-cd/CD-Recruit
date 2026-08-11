import http from "http";

function fetchPage(urlStr: string) {
  return new Promise((resolve) => {
    http
      .get(urlStr, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            url: urlStr,
            statusCode: res.statusCode,
            contentType: res.headers["content-type"],
            location: res.headers["location"],
            bodySnippet: body.substring(0, 500),
          });
        });
      })
      .on("error", (err) => {
        resolve({ url: urlStr, error: err.message });
      });
  });
}

async function run() {
  console.log("=== INSPECTING FRONTEND SERVERS ===");
  console.log(await fetchPage("http://localhost:5173/"));
  console.log(await fetchPage("http://localhost:5174/"));
  console.log(await fetchPage("http://localhost:5040/"));
}

run();
