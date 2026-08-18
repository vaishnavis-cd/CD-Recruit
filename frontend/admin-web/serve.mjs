import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, "dist/client");
const PORT = parseInt(process.env.ADMIN_PORT || "3002", 10);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

async function main() {
  let serverDefault;
  try {
    const serverModule = await import("./dist/server/server.js");
    serverDefault = serverModule.default;
  } catch (err) {
    console.warn("Could not import dist/server/server.js, falling back to static:", err);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      
      // Serve static assets from dist/client
      let cleanPath = url.pathname;
      if (cleanPath.startsWith("/admin/")) {
        cleanPath = cleanPath.slice(7);
      } else if (cleanPath.startsWith("/admin")) {
        cleanPath = cleanPath.slice(6);
      }
      if (cleanPath.startsWith("/")) cleanPath = cleanPath.slice(1);
      
      if (cleanPath) {
        const filePath = path.join(CLIENT_DIR, cleanPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cache-Control", "public, max-age=86400");
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // Delegate to SSR handler if available
      if (serverDefault?.fetch) {
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        }

        const webReq = new Request(url.href, {
          method: req.method,
          headers,
        });

        const webRes = await serverDefault.fetch(webReq, {}, {});
        
        res.statusCode = webRes.status;
        webRes.headers.forEach((val, key) => {
          if (key.toLowerCase() === "location") {
            let loc = val;
            if (loc.startsWith("/") && !loc.startsWith("/admin")) {
              loc = "/admin" + (loc === "/" ? "" : loc);
            }
            res.setHeader(key, loc);
          } else {
            res.setHeader(key, val);
          }
        });
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

        const arrayBuf = await webRes.arrayBuffer();
        res.end(Buffer.from(arrayBuf));
        return;
      }

      res.statusCode = 404;
      res.end("Not Found");
    } catch (err) {
      console.error("Admin server error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`✓ Admin Web server listening on http://127.0.0.1:${PORT}`);
  });
}

main();
