import type { GarmentCategory } from '../types'
export interface ExtractedPiece { name: string; category: GarmentCategory; color: string; image: string; isolated: boolean }
export async function extractClothes(file: File, progress: (text: string) => void): Promise<ExtractedPiece[]> {
  if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.')
  const worker = new Worker(new URL('./extract.worker.ts', import.meta.url), { type: 'module' })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await new Promise<{ name: string; category: GarmentCategory; color: string; blob: Blob }[]>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Clothing detection took too long. Try a smaller clear photo or retry on a faster device.')), 180000)
      worker.onmessage = ({ data }) => {
        if (data.status) progress(data.status)
        else if (data.error) reject(new Error(data.error))
        else resolve(data.pieces)
      }
      worker.onerror = () => reject(new Error('This browser could not start clothing detection. Try Chrome or upload a transparent garment PNG.'))
      worker.postMessage({ file })
    })
    if (!result.length) throw new Error('No clothes were detected. Try a clear photo showing the outfit, or upload a transparent garment PNG.')
    return await Promise.all(result.map(async ({ blob, ...piece }) => ({ ...piece, image: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob) }), isolated: true })))
  } finally { clearTimeout(timer); worker.terminate() }
}
