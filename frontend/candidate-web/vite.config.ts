import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy /api requests to the NestJS backend in dev
      // Eliminates CORS issues when running on different ports
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
