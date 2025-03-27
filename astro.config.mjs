// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  i18n: {
    defaultLocale: 'en', // Idioma por defecto
    locales: ['en', 'es'], // Lista de idiomas soportados
    routing: {
      prefixDefaultLocale: false, // Opcional: si quieres prefijo para el idioma por defecto
    }
  }
});
