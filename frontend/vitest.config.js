import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'

export default defineConfig({
  // Component suites mount .vue single-file components, so the same Vue and
  // JSX transforms the app build uses have to run here too. The app's other
  // vite plugins (PWA, the frappe-ui proxy/boot-data plugin) are deliberately
  // left out: they exist to serve and bundle the app, not to compile it.
  plugins: [vue(), vueJsx()],
  // vue-jsx keeps the built-in transformer off .jsx by setting
  // `esbuild: { include: /\.ts$/ }`, but Vite now uses oxc and ignores that —
  // so .jsx was compiled with React's automatic runtime and every file
  // importing src/utils/dialogs.jsx failed on "react/jsx-dev-runtime".
  // Mirroring the restriction onto `oxc` hands .jsx back to vue-jsx.
  oxc: { include: /\.ts$/ },
  test: {
    globals: true,
    environment: 'happy-dom',
    root: __dirname,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    server: {
      deps: {
        // frappe-ui ships extensionless relative imports (e.g. './resources')
        // that node's ESM loader rejects. Inlining routes the package through
        // vite's resolver, which handles them the same way the app build does.
        inline: ['frappe-ui'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Everything we intend to cover, so the report shows honest gaps rather
      // than 100% of a hand-picked subset. Components are included even though
      // only a handful have suites — a low number that is true beats a high
      // number measured against a shortlist.
      include: [
        'src/utils/**/*.{js,ts}',
        'src/composables/**/*.{js,ts}',
        'src/stores/**/*.{js,ts}',
        'src/components/**/*.vue',
        'src/pages/**/*.vue',
      ],
      exclude: ['src/utils/dialogs.jsx'],
    },
  },
  resolve: {
    alias: [
      // Must precede '@': array aliases match in order, and every `~icons/*`
      // specifier is a virtual module the frappe-ui vite plugin would supply.
      {
        find: /^~icons\//,
        replacement: path.resolve(__dirname, 'tests/helpers/iconStub.js') + '?',
      },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Same slim ECharts the app builds with (see vite.config.js).
      {
        find: /^echarts$/,
        replacement: path.resolve(__dirname, 'src/utils/echarts.js'),
      },
    ],
  },
})
