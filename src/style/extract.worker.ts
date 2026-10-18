import { env, pipeline, RawImage } from '@huggingface/transformers'

env.allowLocalModels = false
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1
let segmenter: ReturnType<typeof pipeline<'image-segmentation'>> | undefined

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  try {
    self.postMessage({ status: 'Loading clothing detector (first use downloads a model)…' })
    segmenter ??= pipeline('image-segmentation', 'Xenova/segformer_b0_clothes', { device: 'wasm', dtype: 'q8' })
    const run = await segmenter
    const bitmap = await createImageBitmap(event.data.file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    self.postMessage({ status: 'Finding individual clothes…' })
    const image = new RawImage(ctx.getImageData(0, 0, width, height).data, width, height, 4)
    // Let the pipeline bind SegFormer's semantic postprocessor automatically.
    const segments = await run(image)
    const groups = new Map<string, { category: string; name: string; masks: typeof segments }>()
    for (const s of segments) {
      if (!s.label) continue
      const key = /shoe/i.test(s.label) ? 'shoes' : s.label
      const category = /upper/i.test(key) ? 'top' : /pants|skirt/i.test(key) ? 'bottom' : /dress/i.test(key) ? 'dress' : key === 'shoes' ? 'shoes' : undefined
      if (!category) continue
      const group = groups.get(key) ?? { category, name: category === 'top' ? 'Detected top' : /skirt/i.test(key) ? 'Detected skirt' : category === 'bottom' ? 'Detected pants' : `Detected ${category}`, masks: [] }
      group.masks.push(s)
      groups.set(key, group)
    }
    const original = ctx.getImageData(0, 0, width, height)
    const pieces = []
    for (const group of groups.values()) {
      const pixels = new Uint8ClampedArray(original.data)
      let minX = width, minY = height, maxX = 0, maxY = 0, count = 0, r = 0, g = 0, b = 0
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x
        const inside = group.masks.some(({ mask }) => mask.data[(Math.min(mask.height - 1, Math.floor(y * mask.height / height)) * mask.width + Math.min(mask.width - 1, Math.floor(x * mask.width / width))) * mask.channels] > 127)
        pixels[i * 4 + 3] = inside ? original.data[i * 4 + 3] : 0
        if (!inside) continue
        count++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        r += pixels[i * 4]; g += pixels[i * 4 + 1]; b += pixels[i * 4 + 2]
      }
      if (count < width * height * 0.004) continue
      ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
      const w = maxX - minX + 1, h = maxY - minY + 1, shrink = Math.min(1, 360 / Math.max(w, h))
      const out = new OffscreenCanvas(Math.max(1, Math.round(w * shrink)), Math.max(1, Math.round(h * shrink)))
      out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, out.width, out.height)
      const hex = (v: number) => Math.round(v / count).toString(16).padStart(2, '0')
      const name = group.name === 'Detected pants' && h < w * 1.15 ? 'Detected shorts' : group.name
      pieces.push({ name, category: group.category, color: `#${hex(r)}${hex(g)}${hex(b)}`, blob: await out.convertToBlob({ type: 'image/webp', quality: 0.84 }) })
    }
    self.postMessage({ pieces })
  } catch (e) { self.postMessage({ error: `Clothing detection couldn't finish: ${(e as Error).message}. Try a clear, full-outfit JPEG/PNG photo or upload a transparent garment image.` }) }
}
