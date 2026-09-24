import { defineConfig } from 'vite'

// `npm run dev:preview` starts the app against an in-memory sample database (no Supabase, nothing saved).
// It is compiled out of every normal build.
export default defineConfig(({ mode }) => ({
  define: {
    __PREVIEW__: JSON.stringify(mode === 'preview'),
  },
}))
