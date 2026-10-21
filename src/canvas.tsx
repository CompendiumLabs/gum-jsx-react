/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'
import type { ThemeName } from '@gum-jsx/core'

import { createGumRoot, type GumRoot } from './renderer'
import type { GumElementRegistry, GumFonts, GumRenderOptions, GumSize } from './types'
import type { GumRenderStats } from './types'

export interface GumProps extends GumRenderOptions {
  size?: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts?: GumFonts
  className?: string
  style?: CSSProperties
  onRender?: (stats: GumRenderStats & { dom_ms: number }) => void
  [key: string]: unknown
}

type LatestRender = {
  size: GumSize
  theme: ThemeName
  elements?: GumElementRegistry
  options: GumRenderOptions
  props: Record<string, unknown>
  children?: ReactNode
  onRender?: GumProps['onRender']
}

export function Gum({
  size = 500,
  theme = 'light',
  elements,
  fonts,
  className,
  style,
  children,
  textMode,
  background,
  title,
  idPrefix,
  precision,
  onRender,
  ...props
}: PropsWithChildren<GumProps>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<GumRoot | null>(null)
  // Output options belong to the renderer; remaining props style the source page.
  const options = { textMode, background, title, idPrefix, precision }
  const latestRef = useRef<LatestRender>({ size, theme, elements, options, props, children, onRender })
  latestRef.current = { size, theme, elements, options, props, children, onRender }

  useLayoutEffect(() => {
    const host = hostRef.current
    if (host == null) return
    const root = createGumRoot({
      size, theme, elements, fonts, props, ...options,
      onRender: (svg, stats) => {
        if (cancelled) return
        const start = performance.now()
        if (svg !== previous_svg) host.innerHTML = svg
        previous_svg = svg
        latestRef.current.onRender?.({ ...stats, dom_ms: performance.now() - start })
      },
    })
    let cancelled = false
    let previous_svg = ''

    void root.loadFonts().then(() => {
      if (cancelled) return
      const latest = latestRef.current
      rootRef.current = root
      root.render(latest.children, {
        size: latest.size, theme: latest.theme, elements: latest.elements,
        props: latest.props, ...latest.options,
      })
    }).catch(error => {
      // Surface asynchronous font failures through the host without leaving stale art.
      if (!cancelled) {
        host.innerHTML = ''
        console.error(error)
      }
    })

    return () => {
      cancelled = true
      root.unmount()
      if (rootRef.current === root) rootRef.current = null
      host.innerHTML = ''
    }
  }, [fonts])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (root == null) return
    root.render(children, { size, theme, elements, props, ...options })
  })

  return <div ref={hostRef} className={className} style={style} />
}
