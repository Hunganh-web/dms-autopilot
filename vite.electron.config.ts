import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-electron/renderer",
    emptyOutDir: true,
  },
  server: { port: 5599, strictPort: true },
});
