// Builds the playable page: bundles game/src (and the engine it imports) into docs/play/game.js.
//   cd game && npm install && npm run build        (add --dev for a sourcemap)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
import fs from 'node:fs';
const built = new Date().toISOString();
await build({ entryPoints: [path.join(here, 'src/app.js')], bundle: true, format: 'esm', outfile: path.join(here, '../docs/play/game.js'),
  target: 'es2022', minify: !dev, sourcemap: dev, logLevel: 'error', define: { __BUILT__: JSON.stringify(built) } });
// Auto-update (Matt 22 Oct): the title screen compares its own build time with version.json and refreshes itself when a newer one is out.
// The page asks for game.js and style.css with the build time on the end, so a refresh can never pick up an old copy from a cache.
fs.writeFileSync(path.join(here, '../docs/play/version.json'), JSON.stringify({ built }) + '\n');
const v = encodeURIComponent(built.replace(/[^0-9]/g, '').slice(0, 14));
const idx = path.join(here, '../docs/index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/play\/game\.js(\?v=[^"']*)?/g, `play/game.js?v=${v}`).replace(/play\/style\.css(\?v=[^"']*)?/g, `play/style.css?v=${v}`));
console.log('built docs/play/game.js', built);
