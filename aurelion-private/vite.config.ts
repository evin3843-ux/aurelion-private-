import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/** After the build, stamp sw.js with the full list of emitted files and a content hash. */
function precache(): Plugin {
  return {
    name: 'aurelion-precache',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const walk = (d: string): string[] => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
      const files = walk(dist).filter(f => !f.endsWith('sw.js')).sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(f));
      const assets = ['./', ...files.map(f => './' + relative(dist, f).split('\\').join('/'))];
      const sw = join(dist, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('"__ASSETS__"', JSON.stringify(assets)));
    },
  };
}

export default defineConfig({
  base: './', // relative paths so the app works from any GitHub Pages subdirectory
  plugins: [react(), precache()],
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
