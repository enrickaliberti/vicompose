import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const f = 'dist/visualcompose.min.js';
const buf = readFileSync(f);
console.log(`${f}: ${(buf.length/1024).toFixed(1)} KB min, ${(gzipSync(buf).length/1024).toFixed(1)} KB gzip`);
