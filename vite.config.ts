import path from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base : « / » en local ; en CI (GitHub Pages) le workflow définit BASE_PATH
// sous la forme /<nom-du-dépôt>/ (D17 — Pages sert le site sous un sous-chemin).
// vite-plugin-pwa aligne automatiquement start_url/scope sur cette base.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    // Milestone 7 (D13) : app installable, shell servi hors-ligne par le
    // service worker (precache du build + repli de navigation sur index.html).
    // La donnée, elle, n'est pas cachée : c'est la file IndexedDB qui joue
    // le rôle hors-ligne (lib/pendingStore).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'La Voiture à Jojo — suivi kilométrique',
        short_name: 'Voiture Jojo',
        description:
          'Suivi du compteur kilométrique de la voiture partagée, avec saisie hors-ligne.',
        lang: 'fr-FR',
        // neutral (thème shadcn nova) : fond clair, encre quasi-noire.
        theme_color: '#f8f8f8',
        background_color: '#f8f8f8',
        display: 'standalone',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Repli SPA hors-ligne : toute navigation inconnue retombe sur le
        // shell pré-caché (le routeur prend le relais, D17).
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
