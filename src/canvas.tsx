/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'
import type { ThemeName } from '@gum-jsx/core'

import { createGumRoot, type GumRoot } from './renderer'
import type { GumElementRegistry, GumFonts, GumSize } from './types'

export interface GumProps {
  size?: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts?: GumFonts
  className?: string
  style?: CSSProperties
  [key: string]: unknown
}

type LatestRender = {
  size: GumSize
  theme: ThemeName
  elements?: GumElementRegistry
  props: Record<string, unknown>
  children?: ReactNode
}

export function Gum({
  size = 500,
  theme = 'light',
  elements,
  fonts,
  className,
  style,
  children,
  ...props
}: PropsWithChildren<GumProps>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<GumRoot | null>(null)
  const latestRef = useRef<LatestRender>({ size, theme, elements, props, children })
  latestRef.current = { size, theme, elements, props, children }

  useLayoutEffect(() => {
    const host = hostRef.current
    if (host == null) return
    const root = createGumRoot({
      size, theme, elements, fonts, props,
      onRender: svg => { host.innerHTML = svg },
    })
    let cancelled = false

    void root.loadFonts().then(() => {
      if (cancelled) return
      const latest = latestRef.current
      root.setSize(latest.size)
      root.setTheme(latest.theme)
      root.setElements(latest.elements)
      root.setProps(latest.props)
      rootRef.current = root
      root.render(latest.children)
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

  useLayoutEffect(() => { rootRef.current?.setSize(size) }, [size])
  useLayoutEffect(() => { rootRef.current?.setTheme(theme) }, [theme])
  useLayoutEffect(() => { rootRef.current?.setElements(elements) }, [elements])
  useLayoutEffect(() => {
    const root = rootRef.current
    if (root == null) return
    root.setProps(props)
    root.render(children)
  }, [children, props])

  return <div ref={hostRef} className={className} style={style} />
}
