/** Resolve bundled clothing beneath the app's deployment path, including old saves. */
export function garmentImage(image?: string): string | undefined {
  if (!image) return undefined
  if (!image.startsWith('/wardrobe/')) return image
  return `${import.meta.env.BASE_URL}${image.slice(1).replace(/\.jpg$/, '.png')}`
}
