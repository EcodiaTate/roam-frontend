import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  appType: "spa",

  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },

  build: {
    target: "esnext",
    outDir: "out",
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          supabase: ["@supabase/supabase-js"],
          revenuecat: ["@revenuecat/purchases-capacitor"],
        },
      },
    },
  },

  server: {
    port: 3000,
    open: false,
  },
});
