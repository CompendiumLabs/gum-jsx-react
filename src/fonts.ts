import type { FontSource, TextDraw } from '@gum-jsx/core'
import type { GumFonts } from './types'

export type BrowserFonts = { family: (draw: TextDraw) => string }
type Registration = { version: string | number; users: number; faces: FontFace[];
  fonts: BrowserFonts; ready: Promise<void> }
const registrations = new WeakMap<GumFonts, WeakMap<Document, Registration>>()
let next_family = 0
const face_key = (family: string, weight = 400, style = 'normal') => JSON.stringify([family, weight, style])

// Match the measured font provider, while isolating different providers that use
// the same family names. Shared figures retain registrations until the last release.
export function acquire_fonts(provider: GumFonts, document: Document) {
  let documents = registrations.get(provider)
  if (!documents) { documents = new WeakMap(); registrations.set(provider, documents) }
  let entry = documents.get(document)
  const version = provider.version ?? 0
  if (!entry || entry.version !== version) {
    const names = new Map<string, string>()
    const sources = provider.font_sources?.() ?? []
    const faces = sources.map((source: FontSource) => {
      const name = `gum-face-${next_family++}`
      names.set(face_key(source.family, source.weight, source.style), name)
      const data = source.source instanceof URL ? `url(${JSON.stringify(source.source.href)})`
        : new Uint8Array(source.source).buffer
      const face = new FontFace(name, data, { weight: String(source.weight), style: source.style })
      document.fonts.add(face)
      return face
    })
    entry = { version, users: 0, faces,
      fonts: { family: draw => names.get(face_key(draw.font_family, draw.font_weight, draw.font_style)) ?? draw.font_family },
      ready: Promise.all(faces.map((face, index) => face.load().catch(cause => {
        const source = sources[index]
        const origin = source.source instanceof URL ? source.source.href : 'registered bytes'
        throw new Error(`Unable to load browser font ${source.family} from ${origin}: ${cause}`, { cause })
      }))).then(() => {}),
    }
    documents.set(document, entry)
  }
  entry.users++
  const held = entry
  let released = false
  return { fonts: held.fonts, ready: held.ready, release() {
    if (released) return
    released = true
    if (--held.users === 0) {
      for (const face of held.faces) document.fonts.delete(face)
      if (documents.get(document) === held) documents.delete(document)
    }
  } }
}
