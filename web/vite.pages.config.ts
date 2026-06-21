import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/tu-dien-tieng-viet/",
  plugins: [react()],
  root: "static",
  publicDir: "../public",
  build: {
    emptyOutDir: true,
    outDir: "../dist-pages",
  },
});
