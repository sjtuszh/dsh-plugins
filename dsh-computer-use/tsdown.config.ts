import { defineConfig } from 'tsdown'

// Bundles the two Cordis plugin entry points the bundle's cordis.patch.yml
// references: the package root (Service Definition) and ./plugin (tools +
// provider registration). Source uses explicit `.ts` import specifiers per the
// harness convention; tsdown rewrites them to `.js` in the emitted tree.
export default defineConfig({
  entry: ['src/index.ts', 'src/plugin.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  outDir: 'lib',
  clean: true,
})
