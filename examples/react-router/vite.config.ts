import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { runtime } from '@taucad/runtime/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [...runtime(), reactRouter(), tailwindcss()],
});
