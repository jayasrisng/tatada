// Builds small JPEG fixtures for the photo-import browser check:
//   lisbon-meta.jpg  EXIF date + XMP City/Country/Location (labels from metadata)
//   porto-gps.jpg    EXIF date + GPS only (labels need reverse geocoding)
//   unknown.jpg      no metadata at all (everything stays blank)
// The base image comes from Chrome's canvas; EXIF/XMP segments are written by hand.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const out = 'scripts/fixtures/photos'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const jpeg = async (color, label) => Buffer.from((await page.evaluate(([c, t]) => {
  const k = document.createElement('canvas'); k.width = 320; k.height = 240
  const g = k.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText(t, 20, 130)
  return k.toDataURL('image/jpeg', 0.8).split(',')[1]
}, [color, label])), 'base64')

// Minimal little-endian TIFF/EXIF: IFD0 → ExifIFD (DateTimeOriginal) and optional GPS IFD.
function exif({ date, gps }) {
  const entries0 = [], data = []
  const buf = []
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b }
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b }
  // Layout: header(8) | IFD0 | ExifIFD | GPSIFD | data
  const ifdSize = (n) => 2 + n * 12 + 4
  const n0 = gps ? 2 : 1, nExif = 1, nGps = gps ? 5 : 0
  const off0 = 8, offExif = off0 + ifdSize(n0), offGps = offExif + ifdSize(nExif), offData = offGps + (gps ? ifdSize(nGps) : 0)
  let cursor = offData
  const put = (bytes) => { const at = cursor; data.push(bytes); cursor += bytes.length; return at }
  const entry = (tag, type, count, valueOrOffset) => Buffer.concat([u16(tag), u16(type), u32(count), Buffer.isBuffer(valueOrOffset) ? valueOrOffset : u32(valueOrOffset)])
  const dateBytes = Buffer.from(`${date}\0`, 'ascii')
  const ifd0 = [entry(0x8769, 4, 1, offExif)]
  if (gps) ifd0.push(entry(0x8825, 4, 1, offGps))
  const exifIfd = [entry(0x9003, 2, dateBytes.length, put(dateBytes))]
  const rational = (vals) => Buffer.concat(vals.flatMap(([n, d]) => [u32(n), u32(d)]))
  const dms = (v) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 100); return rational([[d, 1], [m, 1], [s, 100]]) }
  const gpsIfd = gps ? [
    entry(0x0000, 1, 4, Buffer.from([2, 3, 0, 0])),
    entry(0x0001, 2, 2, Buffer.from([gps.lat >= 0 ? 0x4e : 0x53, 0, 0, 0])),
    entry(0x0002, 5, 3, put(dms(gps.lat))),
    entry(0x0003, 2, 2, Buffer.from([gps.lon >= 0 ? 0x45 : 0x57, 0, 0, 0])),
    entry(0x0004, 5, 3, put(dms(gps.lon))),
  ] : []
  const ifd = (es) => Buffer.concat([u16(es.length), ...es, u32(0)])
  buf.push(Buffer.from('II*\0', 'ascii'), u32(8), ifd(ifd0), ifd(exifIfd))
  if (gps) buf.push(ifd(gpsIfd))
  const tiff = Buffer.concat([...buf, ...data])
  return Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
}
const xmp = ({ city, country, location }) => Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii'), Buffer.from(
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
  `<rdf:Description rdf:about="" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" photoshop:City="${city}" photoshop:Country="${country}" Iptc4xmpCore:Location="${location}"/>` +
  `</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`, 'utf8')])
const segment = (marker, payload) => { const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2); return Buffer.concat([Buffer.from([0xff, marker]), len, payload]) }
// Insert APP1 segments right after SOI, dropping the canvas's own APP0.
const withSegments = (base, segs) => Buffer.concat([base.subarray(0, 2), ...segs.map((s) => segment(0xe1, s)), base.subarray(2)])

writeFileSync(`${out}/lisbon-meta.jpg`, withSegments(await jpeg('#3a6ea5', 'Lisboa'), [exif({ date: '2024:05:01 10:30:00' }), xmp({ city: 'Lisboa', country: 'Portugal', location: 'Miradouro da Graça' })]))
writeFileSync(`${out}/porto-gps.jpg`, withSegments(await jpeg('#a55a3a', 'Porto'), [exif({ date: '2024:05:03 18:05:00', gps: { lat: 41.1456, lon: -8.611 } })]))
writeFileSync(`${out}/unknown.jpg`, await jpeg('#4a4a4a', '?'))
await browser.close()
console.log('Wrote photo fixtures to', out)
