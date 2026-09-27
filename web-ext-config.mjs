// Shared configuration for web-ext (lint / run / build).
// Keeps dev tooling and docs out of the packaged extension.
//
// It is ESM (.mjs) on purpose: with Node 23+ a CommonJS config exposes a
// 'module.exports' export and web-ext 8 rejects it as an unknown option, so
// `npm run build` failed with the old web-ext-config.cjs.
export default {
  sourceDir: '.',
  ignoreFiles: [
    'node_modules',
    'dist',
    'web-ext-artifacts',
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
    '.github',
    'scripts',
    'test',
    'tienda',
    '*.md',
    'LICENSE',
  ],
  build: {
    overwriteDest: true,
  },
}
