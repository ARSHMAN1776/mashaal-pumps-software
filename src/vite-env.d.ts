/// <reference types="vite/client" />

/** true only when started with `npm run dev:preview` (in-memory sample data, no Supabase) */
declare const __PREVIEW__: boolean

/** the software version (package.json) and the day this build was made */
declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
