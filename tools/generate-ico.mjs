import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ICONS_DIR = join(ROOT, 'icons')

async function createIco() {
  const img32 = await readFile(join(ICONS_DIR, 'favicon-32.png'))
  const img192 = await readFile(join(ICONS_DIR, 'icon-192.png'))
  const img512 = await readFile(join(ICONS_DIR, 'icon-512.png'))

  const images = [
    { width: 32, height: 32, buffer: img32 },
    { width: 192, height: 192, buffer: img192 },
    { width: 0, height: 0, buffer: img512 }, // 0 means 256+ in ICO spec
  ]

  const headerSize = 6
  const dirEntrySize = 16
  const numImages = images.length
  let dataOffset = headerSize + dirEntrySize * numImages

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // Reserved
  header.writeUInt16LE(1, 2) // Type 1 = Icon
  header.writeUInt16LE(numImages, 4) // Number of images

  const dirEntries = []
  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize)
    entry.writeUInt8(img.width, 0) // Width (0 means 256)
    entry.writeUInt8(img.height, 1) // Height (0 means 256)
    entry.writeUInt8(0, 2) // Colors (0 = no palette)
    entry.writeUInt8(0, 3) // Reserved
    entry.writeUInt16LE(1, 4) // Color planes
    entry.writeUInt16LE(32, 6) // Bits per pixel
    entry.writeUInt32LE(img.buffer.length, 8) // Size of image data
    entry.writeUInt32LE(dataOffset, 12) // Offset of image data
    dirEntries.push(entry)
    dataOffset += img.buffer.length
  }

  const finalBuffer = Buffer.concat([header, ...dirEntries, ...images.map((i) => i.buffer)])
  const outputPath = join(ICONS_DIR, 'star-anki.ico')
  await writeFile(outputPath, finalBuffer)
  console.log(`[star-anki] Ícone gerado com sucesso: ${outputPath} (${finalBuffer.length} bytes)`)
}

createIco().catch(console.error)
