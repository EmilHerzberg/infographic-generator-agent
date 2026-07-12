/// <reference types="vite/client" />
// Types Vite's `import.meta.glob` / `import.meta.env` for tsc. The triple-slash
// reference is honored even though tsconfig pins `types` to ["node"] (an explicit
// reference is not subject to that auto-inclusion allowlist). Fixes the
// import.meta.glob errors in src/preview/registry.ts.
