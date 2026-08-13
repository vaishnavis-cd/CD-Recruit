import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react() as any,
    tailwindcss() as any,
    // Serve mediapipe WASM files with the correct MIME type
    {
      name: "mediapipe-wasm-mime",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.includes("/mediapipe/") && req.url.endsWith(".wasm")) {
            res.setHeader("Content-Type", "application/wasm");
            // Allow WASM to load under COEP credentialless
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Pre-bundle CJS shared-types for dev server
    include: ["@cd-recruit/shared-types"],
    exclude: ["sql.js"],
  },
  envDir: resolve(__dirname, "../../"),
  build: {
    commonjsOptions: {
      include: [/shared-types/, /node_modules/],
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    headers: {
      // credentialless allows cross-origin isolation for WASM/SharedArrayBuffer
      // while still permitting getUserMedia camera access
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
