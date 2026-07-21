import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/click': 'http://localhost:3001',
      '/postback': 'http://localhost:3001',
      '/to-offer': 'http://localhost:3001',
    },
  },
});
