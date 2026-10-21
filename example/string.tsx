import { useLayoutEffect, useRef } from 'react'
import type { PropsWithChildren } from 'react'
import { createGumRoot } from '../src/index'
import type { GumProps, GumRoot } from '../src/index'

// Keep the old insertion path only in the lab, for measuring the same scene.
export function StringGum({ children, size, onRender, onError }: PropsWithChildren<GumProps>) {
  const host = useRef<HTMLDivElement>(null)
  const root = useRef<GumRoot | null>(null)
  const latest = useRef({ children, size, onRender, onError })
  useLayoutEffect(() => { latest.current = { children, size, onRender, onError } })
  useLayoutEffect(() => {
    let cancelled = false, previous = ''
    const renderer = createGumRoot({ size: latest.current.size, onRender: (svg, stats) => {
      if (cancelled) return
      const start = performance.now()
      if (svg !== previous) host.current!.innerHTML = svg
      previous = svg
      latest.current.onRender?.({ ...stats, dom_ms: performance.now() - start })
    } })
    void renderer.loadFonts().then(() => {
      if (cancelled) return
      root.current = renderer
      renderer.render(latest.current.children, { size: latest.current.size })
    }).catch(error => { if (!cancelled) latest.current.onError?.(error) })
    return () => { cancelled = true; root.current = null; renderer.unmount() }
  }, [])
  useLayoutEffect(() => { root.current?.render(children, { size }) })
  return <div ref={host} />
}
