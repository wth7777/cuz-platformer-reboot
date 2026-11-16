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
});