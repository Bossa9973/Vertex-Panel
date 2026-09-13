import react from '@vitejs/plugin-react-swc'
import laravel from 'laravel-vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import macrosPlugin from 'vite-plugin-babel-macros'

export default defineConfig({
    plugins: [
        react(),
        laravel(['resources/scripts/main.tsx']),
        macrosPlugin(),
        ...(process.env.ANALYZE === 'true'
            ? [
                  visualizer({
                      filename: './public/stats.html',
                  }),
              ]
            : []),
    ],
    build: {
        target: 'es2020',
        minify: 'esbuild',
        cssCodeSplit: true,
        sourcemap: false,
        reportCompressedSize: false,
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
            onwarn(warning, defaultHandler) {
                // Suppress noisy "use client" / "use server" RSC directives from third-party packages
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return
                }
                // Downgrade unresolved imports to a console warning instead of a fatal build error
                if (warning.code === 'UNRESOLVED_IMPORT') {
                    console.warn(`[vite] unresolved import warning: ${warning.message}`)
                    return
                }
                defaultHandler(warning)
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom') || id.includes('easy-peasy')) {
                            return 'vendor-react'
                        }
                        if (id.includes('@heroicons') || id.includes('lucide-react') || id.includes('react-icons')) {
                            return 'vendor-icons'
                        }
                        if (id.includes('framer-motion') || id.includes('motion') || id.includes('chart.js') || id.includes('react-chartjs-2')) {
                            return 'vendor-motion-charts'
                        }
                        if (id.includes('@mantine') || id.includes('@emotion')) {
                            return 'vendor-mantine'
                        }
                        if (id.includes('@tsparticles')) {
                            return 'vendor-particles'
                        }
                    }
                },
            },
        },
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'es2020',
        },
    },
    server: {
        port: 1234,
        hmr: {
            host: 'localhost',
        },
    },
    resolve: {
        alias: {
            '@': '/resources/scripts',
        },
    },
})
