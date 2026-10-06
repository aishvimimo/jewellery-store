import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'static',
  integrations: [react(), sitemap({ filter: page => !['/cart/', '/checkout/', '/orders/', '/account/', '/wishlist/', '/404/', '/admin/', '/preview-product/'].includes(new URL(page).pathname) })],
  vite: { server: { fs: { allow: ['../..'] } } },
});
