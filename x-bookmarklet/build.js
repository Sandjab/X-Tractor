#!/usr/bin/env node
// Build script: generates bookmarklet.min.js, bookmarklet.url.txt,
// and updates the href in install.html from bookmarklet.js source.
//
// Usage: node build.js

const fs = require('fs');
const path = require('path');

const dir = __dirname;

async function build() {
  const { minify } = await import('terser');

  // Read source
  const src = fs.readFileSync(path.join(dir, 'bookmarklet.js'), 'utf8');

  // Minify with terser (proper JS minification that preserves strings)
  // evaluate:false empêche terser de plier '__READABILITY_' + 'URL__'
  // en '__READABILITY_URL__' (ce qui rendrait le guard toujours vrai
  // et éliminerait loadReadability par dead code elimination).
  // reduce_vars:false empêche l'inlining du const READABILITY_URL.
  const result = await minify(src, {
    compress: { passes: 2, evaluate: false, reduce_vars: false },
    mangle: false,
    output: { comments: false }
  });

  if (result.error) {
    console.error('Minification error:', result.error);
    process.exit(1);
  }

  const minified = result.code;
  fs.writeFileSync(path.join(dir, 'bookmarklet.min.js'), minified);
  console.log(`bookmarklet.min.js: ${minified.length} chars`);

  // URL-encode for javascript: URI
  const urlEncoded = 'javascript:' + encodeURIComponent(minified);
  fs.writeFileSync(path.join(dir, 'bookmarklet.url.txt'), urlEncoded);
  console.log(`bookmarklet.url.txt: ${urlEncoded.length} chars`);

  // Update install.html href
  let html = fs.readFileSync(path.join(dir, 'install.html'), 'utf8');
  html = html.replace(
    /(id="bookmarklet-link"\s+href=")javascript:[^"]*(")/,
    `$1${urlEncoded}$2`
  );
  fs.writeFileSync(path.join(dir, 'install.html'), html);
  console.log('install.html updated');
}

build().catch(e => { console.error(e); process.exit(1); });
