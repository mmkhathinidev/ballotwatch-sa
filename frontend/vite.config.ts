import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // A GitHub project page is served from /<repo>/, so allow a base override.
  base: (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.VITE_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
