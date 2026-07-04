import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "client",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./client/src", import.meta.url)) },
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:4000" },
  },
});
