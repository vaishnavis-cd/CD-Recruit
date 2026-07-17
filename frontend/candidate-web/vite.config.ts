import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  build: {
    // Tell Rollup's built-in CommonJS plugin to handle shared-types CJS output
    commonjsOptions: {
      include: [/shared-types/, /node_modules/],
    },
  },
  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
