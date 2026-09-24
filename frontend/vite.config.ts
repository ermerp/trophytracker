import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Hintergrund der App-Symbole und des Startbildschirms, damit beide zum
 * Symbol passen.
 */
const SYMBOLFARBE = '#1f2633'

/**
 * Farbe der Statusleiste. Bis Stufe 19 war das dieselbe wie der
 * Symbolhintergrund - gemessen am Bildschirmfoto des Nutzers vom 24.09.2026
 * ergab das eine sichtbare Kante: Statusleiste rgb(31,38,51), Seite
 * darunter rgb(18,21,28). Jetzt traegt die Statusleiste die Grundfarbe der
 * Anwendung und die Seite beginnt ohne Naht.
 */
const GRUNDFARBE = '#12151c'

/**
 * Nur Antworten der eigenen Origin, die nicht aus einer Weiterleitung stammen,
 * kommen in den Cache. Der Grund ist Cloudflare Access: Bei abgelaufener
 * Sitzung antwortet Access mit 302 auf seine Anmeldeseite (eine fremde
 * Origin). Ohne diese Pruefung legte der Service Worker die Anmeldeseite als
 * `index.html` oder als API-Antwort ab und zeigte sie offline als Sammlung.
 * Die Funktion wird in den Service Worker serialisiert - kein Zugriff auf
 * Variablen von aussen.
 */
declare const self: { location: { origin: string } } // Global des Service Workers, nicht der Build-Umgebung
const nurEigeneAntwort = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.ok && !response.redirected && new URL(response.url).origin === self.location.origin ? response : null,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    /**
     * PWA (Stufe 18, Spezifikation Abschnitt 13).
     *
     * index.html liegt bewusst NICHT im Precache: Access prueft Navigationen,
     * und eine aus dem Cache bediente App-Huelle kaeme bei abgelaufener
     * Sitzung nie mehr zur Anmeldung - jede API-Anfrage scheiterte am
     * Redirect auf eine fremde Origin, ein Neuladen aenderte nichts.
     * Navigationen gehen deshalb Network-First; offline kommt die zuletzt
     * geladene Seite aus dem Cache, die gehashten Assets aus dem Precache.
     * Nebeneffekt: Ein normales Neuladen bringt nach einem Deploy die neue
     * Fassung, der Service Worker aktualisiert sich still (autoUpdate).
     */
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      manifest: {
        name: 'Trophytracker',
        short_name: 'Trophytracker',
        description: 'PlayStation-Spielesammlung: Besitz, Trophäen, Listen',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: GRUNDFARBE,
        background_color: SYMBOLFARBE,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Kein index.html (siehe oben), kein WASM: Der ZXing-Leser (1,1 MB)
        // wird nur auf Geraeten ohne nativen BarcodeDetector gebraucht und
        // kommt dort beim ersten Scan in den Cache (Regel unten).
        globPatterns: ['**/*.{js,css,svg,png,ico}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'seite', plugins: [nurEigeneAntwort] },
          },
          {
            // Alle Leseansichten (Entscheidung des Nutzers vom 19.09.2026);
            // der Export ist gross und kein Lesezugriff der Oberflaeche.
            // Ohne networkTimeoutSeconds: Ein Timeout zeigte bei langsamem
            // Netz Altstaende neben gerade erst gespeicherten Aenderungen.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/export/'),
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 60 * 60 },
              plugins: [nurEigeneAntwort],
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'wasm', expiration: { maxEntries: 4 } },
          },
          {
            // Saira (Stufe 19): Stylesheet und Schriftschnitt aendern sich
            // nicht mehr, sobald sie einmal da sind. Ohne diese Regel faellt
            // die Anwendung offline auf die System-Schrift zurueck - das
            // braeche nichts, saehe aber bei jedem Start anders aus.
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'schriften',
              expiration: { maxEntries: 12, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cover von IGDB: gehashte Bild-Ids, aendern sich nie. Als
            // <img> geladen sind die Antworten opaque (Status 0).
            urlPattern: ({ url }) => url.origin === 'https://images.igdb.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cover',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Im lokalen Betrieb laeuft der Worker getrennt unter :8787.
    // Produktiv gibt es diesen Proxy nicht: dort liefert derselbe Worker
    // sowohl die Assets als auch /api/*, es ist also dieselbe Origin.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
