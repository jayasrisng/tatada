import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
GlobalWorkerOptions.workerSrc = worker
export async function confirmationPdf(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 30) throw new Error('Use a confirmation PDF with at most 30 pages.')
    let text = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent()
      for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
      text += '\n'
      if (text.length > 150_000) throw new Error('This PDF contains too much text. Paste the relevant booking details instead.')
    }
    if (!text.trim()) throw new Error('No readable text in this PDF. Paste the booking text or enter details manually; scanned images need OCR outside Tatada.')
    return text
  } finally { await task.destroy() }
}
