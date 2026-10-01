import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const common = { entryPoints: ['src/visualcompose.js'], bundle: true, target: 'es2020', legalComments: 'none' };

// ESM leggibile (per bundler e <script type="module">)
await build({ ...common, format: 'esm', outfile: 'dist/visualcompose.js' });
// ESM minificato (per CDN: jsDelivr/unpkg)
await build({ ...common, format: 'esm', minify: true, sourcemap: true, outfile: 'dist/visualcompose.min.js' });
// IIFE con global `VisualCompose` per <script src> classico
await build({ ...common, format: 'iife', globalName: 'VC', minify: true, outfile: 'dist/visualcompose.iife.min.js' });
console.log('build ok');
