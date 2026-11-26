import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Tests unitaires du cœur métier (milestone 4) : règle D6 pure, compression
// photo, raccords de hooks. Tout est local (node ou jsdom) : aucun test
// n'atteint Supabase — les garde-fous SQL ont leurs scripts dédiés (M2).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
