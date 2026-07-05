import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/database", "firebase/functions"],
          motion: ["framer-motion"],
          vendor: ["react", "react-dom", "react-dom/client", "lucide-react", "canvas-confetti"]
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
