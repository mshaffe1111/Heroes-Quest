// Builds the playable page: bundles game/src (and the engine it imports) into docs/play/game.js.
//   cd game && npm install && npm run build        (add --dev for a sourcemap)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
await build({ entryPoints: [path.join(here, 'src/app.js')], bundle: true, format: 'esm', outfile: path.join(here, '../docs/play/game.js'),
  target: 'es2022', minify: !dev, sourcemap: dev, logLevel: 'error', define: { __BUILT__: JSON.stringify(new Date().toISOString()) } });
console.log('built docs/play/game.js');
