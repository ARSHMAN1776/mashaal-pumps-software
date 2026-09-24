import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// `npm run dev:preview` starts the app against an in-memory sample database (no Supabase, nothing saved).
// It is compiled out of every normal build.
export default defineConfig(({ mode }) => ({
  define: {
    __PREVIEW__: JSON.stringify(mode === 'preview'),
    // shown in the menu and in Station Setup, so everyone can say which version they are running
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
}))
