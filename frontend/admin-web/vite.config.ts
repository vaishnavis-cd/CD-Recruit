import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

const apiTarget = process.env.API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
  },
  envDir: "../../",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
