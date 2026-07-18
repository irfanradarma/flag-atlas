import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    // esbuild's minifier miscompiles maplibre-gl 5.24's tile clipping
    // (eastern-Australia tile renders empty). Terser produces correct output.
    minify: 'terser',
  },
});
