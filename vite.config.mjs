import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@app": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    outDir: "dist/client",
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL("./index.html", import.meta.url)),
        home: fileURLToPath(new URL("./home.html", import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), tailwindcss()],
});
