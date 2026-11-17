import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/<script type="module" crossorigin /g, '<script type="module" ');
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: './src/main.js',
      },
      output: {
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});