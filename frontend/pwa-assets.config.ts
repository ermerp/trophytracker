import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * Erzeugt die PNG-Symbole der PWA aus public/icon.svg (Stufe 18):
 *   npx pwa-assets-generator
 * Der Preset polstert Maskable- und Apple-Symbol standardmaessig weiss; der
 * Hintergrund bekommt stattdessen die Flaeche des Symbols, sonst zeigt
 * Android beim Rundschnitt einen weissen Ring.
 */
const HINTERGRUND = '#1f2633'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: HINTERGRUND } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: HINTERGRUND } },
  },
  images: ['public/icon.svg'],
})
