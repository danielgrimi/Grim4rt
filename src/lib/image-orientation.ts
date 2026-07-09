// Real pixel dimensions were measured directly from the image files in
// public/ (width/height via `sips`). Everything not listed here is portrait
// (taller than wide) — these are the only artworks whose source photo is
// genuinely wider than it is tall.
const LANDSCAPE_IMAGES = new Set([
  'Flores.jpg',
  'Mirada_Intrapersonal.jpg',
  'Losroques.jpg',
  'Caballo.jpg',
  'Morocho.jpg',
  'Morocho2.jpg',
  'Caballo3.jpg',
])

export function isLandscape(img: string): boolean {
  return LANDSCAPE_IMAGES.has(img)
}
