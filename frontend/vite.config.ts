import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "autoUpdate",
      // We ship our own manifest file (public/site.webmanifest); don't let the
      // plugin inject a second one.
      manifest: false,
      includeAssets: [
        "favicon.ico",
        "stallion-icon-32.png",
        "stallion-icon-180.png",
        "brand/stallion-mark.svg",
        "brand/stallion-horizontal.svg",
      ],
      workbox: {
        // App shell only. Precache the build's static assets so the installed
        // Courier app opens offline, but NEVER cache API responses, manifests,
        // worksheets, or any client/PII data. Those stay network-only.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        navigateFallback: "/index.html",
        // Keep the SPA fallback away from API and download routes.
        navigateFallbackDenylist: [/^\/courier\//, /^\/api\//],
        runtimeCaching: [
          {
            // Google Fonts stylesheets are safe to cache and speed up cold launch.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
