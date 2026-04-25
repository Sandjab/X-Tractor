#!/usr/bin/env node
// Build script: generates bookmarklet.min.js, bookmarklet.url.txt,
// and updates the href in install.html from bookmarklet.js source.
//
// Usage: node build.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;

function computeBuildVersion() {
  let sha = 'dev';
  try {
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    // pas dans un repo git
  }
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${sha}-${date}`;
}

async function build() {
  const { minify } = await import('terser');

  const version = computeBuildVersion();
  console.log(`build version: ${version}`);

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

  // Inject build version into the minified bookmarklet
  const minified = result.code.replace(/__BUILD_VERSION__/g, version);
  fs.writeFileSync(path.join(dir, 'bookmarklet.min.js'), minified);
  console.log(`bookmarklet.min.js: ${minified.length} chars`);

  // URL-encode for javascript: URI
  const urlEncoded = 'javascript:' + encodeURIComponent(minified);
  fs.writeFileSync(path.join(dir, 'bookmarklet.url.txt'), urlEncoded);
  console.log(`bookmarklet.url.txt: ${urlEncoded.length} chars`);

  // Update install.html href + visible build banner
  let html = fs.readFileSync(path.join(dir, 'install.html'), 'utf8');
  html = html.replace(
    /(id="bookmarklet-link"\s+href=")javascript:[^"]*(")/,
    `$1${urlEncoded}$2`
  );
  // Bannière visible : remplace le contenu du <strong> dans .build-banner.
  // Idempotent : marche aussi bien si le placeholder est encore là ou si une version précédente y est.
  html = html.replace(
    /(<div class="build-banner">build\s*:\s*<strong>)[^<]*(<\/strong><\/div>)/,
    `$1${version}$2`
  );
  fs.writeFileSync(path.join(dir, 'install.html'), html);
  console.log('install.html updated');
}

build().catch(e => { console.error(e); process.exit(1); });
