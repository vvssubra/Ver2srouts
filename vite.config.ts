import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Stamps a fresh `SW_VERSION` into the built service worker so every
// production build reliably triggers the "New version available" prompt
// in the browser without anyone having to hand-bump a constant.
//
// public/sw.js ships with the literal `__SW_VERSION__` placeholder; in
// dev/preview it stays as that literal (the SW is never registered there
// anyway — see src/main.tsx guards). In a real build, this plugin
// rewrites the file that Vite copied into the output directory.
function stampServiceWorkerVersion() {
  return {
    name: "sprouts-sw-version-stamp",
    apply: "build" as const,
    closeBundle() {
      try {
        const outDir = path.resolve(__dirname, "dist");
        const swPath = path.join(outDir, "sw.js");
        if (!fs.existsSync(swPath)) return;
        const src = fs.readFileSync(swPath, "utf8");
        const stamp = `build-${new Date()
          .toISOString()
          .replace(/[-:T]/g, "")
          .slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
        fs.writeFileSync(swPath, src.replace(/__SW_VERSION__/g, stamp));
      } catch {
        // Best-effort: never fail the build because of the SW stamp.
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    stampServiceWorkerVersion(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
  build: {
    // Split large/rarely-used vendor libraries into their own cached chunks.
    // Reduces initial JS payload and lets the browser parallelise downloads.
    // Pages that don't touch these libs (parent/teacher mobile flows) won't
    // pay for them at all.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-xlsx": ["xlsx"],
          "vendor-maps": ["leaflet", "react-leaflet"],
          "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-dates": ["date-fns", "react-day-picker"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
