import type { AriaAttributes, AriaRole, CSSProperties, DOMAttributes } from 'react'

export type GumHandle = Readonly<{
  /** One rendered placement, not the authored source or an internal drawing. */
  id: string
  element: SVGGElement
  localPoint: (point: { clientX: number; clientY: number }) => { x: number; y: number } | null
  focus: () => void
  capturePointer: (pointerId: number) => void
  releasePointer: (pointerId: number) => void
}>

export type GumInteractionProps = Omit<DOMAttributes<SVGGElement>, 'children' | 'dangerouslySetInnerHTML'>
  & AriaAttributes & {
    role?: AriaRole
    tabIndex?: number
    pointerEvents?: CSSProperties['pointerEvents']
    cursor?: CSSProperties['cursor']
    domStyle?: CSSProperties
    disabled?: boolean
    /** Called once per mounted occurrence; return its cleanup. */
    domRef?: (handle: GumHandle) => void | (() => void)
  }

// Convert client coordinates through the actual SVG placement, CSS scaling and viewBox.
// Detached or singular placements have no meaningful inverse.
export function local_point(element: SVGGraphicsElement, point: { clientX: number; clientY: number }) {
  const matrix = element.getScreenCTM()
  if (!matrix || !element.isConnected || matrix.a * matrix.d === matrix.b * matrix.c) return null
  const result = new DOMPoint(point.clientX, point.clientY).matrixTransform(matrix.inverse())
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? { x: result.x, y: result.y } : null
}

export function occurrence_handle(element: SVGGElement, id: string): GumHandle {
  return Object.freeze({ id, element, localPoint: point => local_point(element, point),
    focus: () => element.focus(),
    capturePointer: pointerId => element.setPointerCapture(pointerId),
    releasePointer: pointerId => {
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
    },
  })
}
