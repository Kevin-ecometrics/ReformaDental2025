// @ts-check
import { defineConfig } from "astro/config";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import sitemap from "@astrojs/sitemap";

import robotsTxt from "astro-robots-txt";

import partytown from "@astrojs/partytown";

// https://astro.build/config
export default defineConfig({
  trailingSlash: "always",
  vite: {
    plugins: [tailwindcss()],
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  site: "https://reformadental.com/",
  integrations: [
    react(),
    sitemap(),
    robotsTxt(),
    partytown({
      config: {
        // Antes incluía "fbq" porque el pixel de Meta corría dentro de Partytown (type="text/partytown" en Layout.astro).
        // Ahora el pixel corre en el hilo principal, así que ya no necesita forward. Si se vuelve a envolver en Partytown, agregar "fbq" de nuevo aquí.
        forward: ["dataLayer.push", "gtag"],
      },
    }),
  ],
});