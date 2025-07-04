import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'FabricWebClient',
      fileName: (format) => `fabric-web-client.${format}.min.js`,
    },
    minify: 'esbuild', // Fast minification
    rollupOptions: {
      // Externalize dependencies you don't want bundled (add as needed)
      external: [],
      output: {
        globals: {},
      },
    },
  },
}); 