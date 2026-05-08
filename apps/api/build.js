import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/server.cjs',
  external: [
    'sql.js',
  ],
  minify: false,
  sourcemap: false,
});

console.log('API build complete: dist/server.cjs');
