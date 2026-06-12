// Shared configuration for web-ext (lint / run / build).
// Keeps dev tooling and docs out of the packaged extension.
module.exports = {
  sourceDir: '.',
  ignoreFiles: [
    'node_modules',
    'dist',
    'web-ext-artifacts',
    'package.json',
    'package-lock.json',
    'web-ext-config.cjs',
    '.github',
    'scripts',
    '*.md',
    'LICENSE',
  ],
  build: {
    overwriteDest: true,
  },
}
