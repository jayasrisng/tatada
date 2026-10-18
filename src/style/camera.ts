/*
 * Turns a camera photo into a small closet image: orientation applied, scaled
 * down, re-encoded through a canvas (which drops EXIF, including GPS), plus a
 * sampled center color for the avatar. Stays small enough for workspace sync.
 */

export const MAX_SIDE = 360

export async function processPhoto(file: File): Promise<{ dataUrl: string; color: string }> {
  if (!file.type.startsWith('image/')) throw new Error('That file isn\'t a photo.')
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is too large.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const g = canvas.getContext('2d')!
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Average of the middle third: usually the garment.
  const { data } = g.getImageData(Math.round(canvas.width / 3), Math.round(canvas.height / 3), Math.max(1, Math.round(canvas.width / 3)), Math.max(1, Math.round(canvas.height / 3)))
  let r = 0, gr = 0, b = 0
  const n = data.length / 4
  for (let i = 0; i < data.length; i += 4) (r += data[i]), (gr += data[i + 1]), (b += data[i + 2])
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.68), color: `#${hex(r)}${hex(gr)}${hex(b)}` }
}
