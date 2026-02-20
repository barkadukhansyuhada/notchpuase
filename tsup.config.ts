import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'main/app': 'src/main/app.ts',
    'preload/index': 'src/preload/index.ts',
  },
  outDir: 'dist',
  target: 'node20',
  platform: 'node',
  format: ['cjs'],
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  external: ['electron'],
});
