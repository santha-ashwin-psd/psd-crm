import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => {
  const isDev = mode === 'development'
  const config = {
    plugins: [
      vue(),
      vueJsx(),
      VitePWA({
        registerType: 'autoUpdate',
        // The app is served by Frappe (which injects boot data into the HTML).
        // A caching service worker served stale, boot-less shells that broke
        // realtime. Self-destroy any SW instead of maintaining an offline cache.
        selfDestroying: true,
        devOptions: {
          enabled: true,
        },
        workbox: {
          // The app is served by Frappe, which injects boot data (site_name,
          // socketio_port, csrf_token, ...) into the HTML via jinja. The default
          // SW navigation fallback serves the precached *static* index.html instead
          // — that shell has only the un-rendered `{% for key in boot %}` template,
          // so window.socketio_port is undefined and realtime falls back to the wrong
          // port (9000). Exclude the Frappe-served routes from the navigation fallback
          // so real navigations always hit the network and get boot-injected HTML.
          navigateFallbackDenylist: [/^\//],
        },
        manifest: {
          display: 'standalone',
          name: 'Frappe CRM',
          short_name: 'Frappe CRM',
          start_url: '/',
          description:
            'Modern & 100% Open-source CRM tool to supercharge your sales operations',
          icons: [
            {
              src: '/assets/xbr_crm/manifest/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/xbr_crm/manifest/manifest-icon-192.maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/assets/xbr_crm/manifest/manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/assets/xbr_crm/manifest/manifest-icon-512.maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // ensure a locally linked frappe-ui reuses the host app's single copy of each peer.
      dedupe: ['vue', 'vue-router', 'frappe-ui', 'dompurify'],
    },
    optimizeDeps: {
      include: [
        'feather-icons',
        'tailwind.config.js',
        'prosemirror-state',
        'prosemirror-view',
        'lowlight',
        'interactjs',
      ],
    },
    server: {
      fs: {
        // allow the parent dir so Vite can serve a locally linked frappe-ui
        // that lives in a sibling repo
        allow: [path.resolve(__dirname, '../..')],
      },
    },
  }

  const frappeui = await importFrappeUIPlugin(isDev, config)
  config.plugins.unshift(
    frappeui({
      frappeProxy: true,
      lucideIcons: true,
      jinjaBootData: true,
      buildConfig: {
        indexHtmlPath: '../xbr_crm/www/crm.html',
        emptyOutDir: true,
        sourcemap: true,
      },
    }),
  )

  return config
})

async function importFrappeUIPlugin(isDev, config) {
  if (isDev) {
    try {
      // Check if local frappe-ui has the vite plugin file
      const fs = await import('node:fs')
      const localVitePluginPath = path.resolve(__dirname, '../frappe-ui/vite')

      if (fs.existsSync(localVitePluginPath)) {
        const module = await import('../frappe-ui/vite')
        console.info('Local frappe-ui vite plugin found, using local plugin')
        config.resolve.alias = getAliases(config)
        return module.default
      } else {
        console.warn('Local frappe-ui vite plugin not found, using npm package')
      }
    } catch (error) {
      console.warn(
        'Local frappe-ui not found, falling back to npm package:',
        error.message,
      )
    }
  }
  // Fall back to npm package if local import fails
  const module = await import('frappe-ui/vite')
  return module.default
}

function getAliases(config) {
  return {
    ...config.resolve.alias,
    'frappe-ui/tailwind': path.resolve(
      __dirname,
      '../frappe-ui/tailwind/preset.js',
    ),
    'frappe-ui/style.css': path.resolve(
      __dirname,
      '../frappe-ui/src/style.css',
    ),
    'frappe-ui/frappe': path.resolve(__dirname, '../frappe-ui/frappe/index.js'),
    // subpath entries must precede the bare `frappe-ui` key: a plain string alias
    // matches by prefix, so without these `frappe-ui/editor` would rewrite to
    // `.../src/index.ts/editor`. `internals` is pulled in by @framework/ui.
    'frappe-ui/editor': path.resolve(
      __dirname,
      '../frappe-ui/src/molecules/editor/index.ts',
    ),
    'frappe-ui/editor-style.css': path.resolve(
      __dirname,
      '../frappe-ui/src/molecules/editor/style.css',
    ),
    'frappe-ui/internals': path.resolve(__dirname, '../frappe-ui/internals.ts'),
    'frappe-ui': path.resolve(__dirname, '../frappe-ui/src/index.ts'),
  }
}
