import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'
import type { ThemeName } from '@gum-jsx/core'
import { createGumRoot } from './renderer'
import type { GumRoot, GumUpdateOptions } from './renderer'
import { SvgScene } from './svg-dom'
import { acquire_fonts } from './fonts'
import type { BrowserFonts } from './fonts'
import type { GumElementRegistry, GumFonts, GumRenderOptions, GumRenderStats, GumSize } from './types'

export interface GumProps extends GumRenderOptions {
  size?: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts?: GumFonts
  className?: string
  style?: CSSProperties
  /** Time from output render to layout effect, including React work; excludes paint. */
  onRender?: (stats: GumRenderStats & { dom_ms: number }) => void
  onError?: (error: unknown) => void
  [key: string]: unknown
}

type Host = { root: GumRoot; fonts: BrowserFonts }
type Input = { root: GumRoot; children: ReactNode; options: GumUpdateOptions }

function same_values(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]))
}

// Only output subscribes. A committed snapshot never becomes new scene input.
function Output({ host, onRender }: { host: Host; onRender?: GumProps['onRender'] }) {
  const snapshot = useSyncExternalStore(host.root.subscribe, host.root.getSnapshot, host.root.getSnapshot)
  const start = performance.now()
  const reported = useRef<typeof snapshot>(undefined)
  useLayoutEffect(() => {
    if (snapshot && reported.current !== snapshot) {
      const stats = snapshot.stats
      const bindings_only = reported.current?.stats === stats
      reported.current = snapshot
      onRender?.({ ...stats, ...(bindings_only ? { created: 0, reused: 0, queries: 0, layouts: 0,
        hits: 0, conversion_ms: 0, layout_ms: 0, svg_ms: 0 } : {}), dom_ms: performance.now() - start })
    }
  }, [snapshot, onRender])
  return snapshot ? <SvgScene snapshot={snapshot} fonts={host.fonts} /> : null
}

export function Gum({ size = 500, theme = 'light', elements, fonts, className, style,
  children, textMode, background, title, idPrefix, precision, onRender, onError, ...props
}: PropsWithChildren<GumProps>) {
  const host_ref = useRef<HTMLDivElement>(null)
  const root_ref = useRef<GumRoot | null>(null)
  const input = useRef<Input | null>(null)
  const [host, set_host] = useState<Host | null>(null)
  const [error, set_error] = useState<unknown>(null)
  const options = { size, theme, elements, props, textMode, background, title, idPrefix, precision }
  const latest = useRef({ children, options, onError })
  // Async completions can only see committed inputs, never speculative renders.
  useLayoutEffect(() => { latest.current = { children, options, onError } })

  // Output/error state changes do not replay unchanged input, including failed input.
  function update_input(root: GumRoot, children: ReactNode, options: GumUpdateOptions) {
    const previous = input.current
    if (previous?.root === root && previous.children === children
      && same_values({ ...previous.options, props: undefined }, { ...options, props: undefined })
      && same_values(previous.options.props ?? {}, options.props ?? {})) return
    input.current = { root, children, options }
    root.render(children, options)
    set_error(null)
  }

  useLayoutEffect(() => {
    let cancelled = false
    let last_error: unknown
    const show_error = (error: unknown) => {
      if (cancelled || error === last_error) return
      last_error = error
      set_error(error)
      latest.current.onError?.(error)
      if (!latest.current.onError) console.error(error)
    }
    const root = createGumRoot({ ...latest.current.options, fonts, onError: show_error })
    let browser_fonts: ReturnType<typeof acquire_fonts> | undefined
    set_error(null)
    set_host(null)
    // Finish measurement preload before FontFace requests the same asset URLs.
    void root.loadFonts().then(async () => {
      if (cancelled) return
      browser_fonts = acquire_fonts(root.container.fonts, host_ref.current!.ownerDocument)
      await browser_fonts.ready
      if (cancelled) return
      root_ref.current = root
      set_host({ root, fonts: browser_fonts.fonts })
      update_input(root, latest.current.children, latest.current.options)
    }).catch(show_error)
    return () => {
      cancelled = true
      root_ref.current = null
      input.current = null
      root.unmount()
      browser_fonts?.release()
    }
  }, [fonts, fonts?.version])

  useLayoutEffect(() => {
    const root = root_ref.current
    if (!root) return
    try { update_input(root, children, options) }
    catch (error) { root.container.onError?.(error) }
  })
  return <div ref={host_ref} className={className} style={style}>
    {error ? <span role="alert">Unable to render Gum: {String(error)}</span>
      : host && <Output host={host} onRender={onRender} />}
  </div>
}
