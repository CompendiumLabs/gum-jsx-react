import { createContext, memo, useContext, useId, useLayoutEffect, useMemo, useRef } from 'react'
import type { SVGProps } from 'react'
import type { Drawing, Fragment, Placement, PixelRect, RectRadii, PathCommand } from '@gum-jsx/core'
import { prepare_render, output_number_formatter, path_data, rect_path, svg_font_family } from '@gum-jsx/core/output'
import type { GumBindings, GumSnapshot } from './types'
import { occurrence_handle } from './interaction'
import type { GumHandle } from './interaction'
import type { BrowserFonts } from './fonts'

const empty_bindings = new Map<string, GumBindings>()
const Bindings = createContext<ReadonlyMap<string, GumBindings>>(empty_bindings)
const origin = { x: 0, y: 0 }
const identity = [1, 0, 0, 1, 0, 0]

type Output = ReturnType<typeof make_output>

// A live output owns weak path caches and a bounded numeric formatter.
function make_output(precision: GumSnapshot['options']['precision'], prefix: string, fonts?: BrowserFonts) {
  const number = output_number_formatter(precision)
  const paths = new WeakMap<readonly PathCommand[], string>()
  return { number, prefix, fonts, path(commands: readonly PathCommand[]) {
    let value = paths.get(commands)
    if (value === undefined) { value = path_data(commands, number); paths.set(commands, value) }
    return value
  } }
}

function rectangle(rect: PixelRect, radius: RectRadii | undefined, output: Output, paint = {}) {
  const n = output.number
  if (radius && !('x' in radius) && rect.width && rect.height) {
    return <path d={rect_path(rect, radius, n)} {...paint} />
  }
  return <rect x={n(rect.x)} y={n(rect.y)} width={n(rect.width)} height={n(rect.height)}
    rx={radius && 'x' in radius ? n(radius.x) : undefined}
    ry={radius && 'x' in radius ? n(radius.y) : undefined} {...paint} />
}

// React removes absent attributes when drawing styles or kinds change.
const DrawingView = memo(function DrawingView({ draw, output }: { draw: Drawing; output: Output }) {
  const n = output.number
  if (draw.kind === 'image') return <image x={n(draw.rect.x)} y={n(draw.rect.y)}
    width={n(draw.rect.width)} height={n(draw.rect.height)} href={draw.data}
    opacity={draw.opacity} preserveAspectRatio="none" />
  if (draw.kind === 'text') {
    const anchor = draw.text_anchor ?? 'middle'
    const family = output.fonts?.family(draw) ?? draw.font_family
    return <text x={n(draw.origin.x + (anchor === 'middle' ? draw.advance / 2 : 0))}
      y={n(draw.origin.y)} textAnchor={anchor} fontFamily={svg_font_family(family)}
      fontSize={n(draw.font_size)} fontWeight={draw.font_weight ?? 400}
      fontStyle={draw.font_oblique ? 'oblique 12deg' : draw.font_style ?? 'normal'}
      fill={draw.fill} opacity={draw.opacity}>{draw.text}</text>
  }
  const paint = { fill: draw.fill, stroke: draw.stroke, strokeWidth: n(draw.stroke_width),
    strokeLinecap: draw.stroke_linecap, strokeLinejoin: draw.stroke_linejoin,
    strokeMiterlimit: draw.stroke_miterlimit, opacity: draw.opacity,
    strokeDasharray: draw.stroke_dasharray?.some(value => value > 0) ? draw.stroke_dasharray.map(n).join(' ') : undefined,
  }
  if (draw.kind === 'rect') return rectangle(draw.rect, draw.radius, output, paint)
  if (draw.kind === 'ellipse') return <ellipse cx={n(draw.center.x)} cy={n(draw.center.y)}
    rx={n(draw.radius.x)} ry={n(draw.radius.y)} {...paint} />
  return <path d={output.path(draw.commands)} {...paint} />
})

// Explicit placement keys disambiguate repeated content. Unkeyed repeated slots
// have positional identity; source tokens identify ordinary authored siblings.
function child_keys(children: readonly Placement[]): string[] {
  const counts = new Map<string, number>()
  const explicit = new Set<string>()
  return children.map((child, index) => {
    if (child.key !== undefined) {
      if (explicit.has(child.key)) throw new Error(`Duplicate placement key: ${child.key}`)
      explicit.add(child.key)
      return `key:${child.key}`
    }
    if (child.fragment.source_key === undefined) return `slot:${index}`
    const key = child.fragment.source_key
    const count = counts.get(key) ?? 0
    counts.set(key, count + 1)
    return `source:${key}:${count}`
  })
}

// Binding context updates stop at this memoized content boundary. Geometry-only
// updates likewise skip unchanged fragments and all of their drawing conversion.
const Content = memo(function Content({ fragment, output }: { fragment: Fragment; output: Output }) {
  const keys = child_keys(fragment.children)
  return <>
    {fragment.draw.map((draw, index) => <DrawingView key={`draw:${index}`} draw={draw} output={output} />)}
    {fragment.children.map((child, index) => <Occurrence key={keys[index]} fragment={child.fragment} offset={child.offset}
      transform={child.transform} output={output} />)}
  </>
})

type OccurrenceProps = Placement & { output: Output }
const Occurrence = memo(function Occurrence({ fragment, offset, transform, output }: OccurrenceProps) {
  const bindings = useContext(Bindings)
  const props = fragment.source_key === undefined ? undefined : bindings.get(fragment.source_key)
  const { domRef, domStyle, disabled, ...attributes } = props ?? {}
  const ref = useRef<SVGGElement>(null)
  const handle = useRef<GumHandle | null>(null)
  const id = `${output.prefix}-${useId().replace(/[^\w-]/g, '_')}`
  const occurrence_id = useRef(id).current
  const n = output.number
  const transforms = [`translate(${n(offset.x)} ${n(offset.y)})`]
  if (transform) transforms.push(`matrix(${transform.map(n).join(' ')})`)
  const dom = { ...attributes } as SVGProps<SVGGElement>
  if (disabled) {
    for (const key of Object.keys(dom)) if (/^on[A-Z]/.test(key)) delete (dom as Record<string, unknown>)[key]
    dom.tabIndex = undefined
    dom.pointerEvents = 'none'
    dom['aria-disabled'] = true
  }

  useLayoutEffect(() => {
    handle.current ??= occurrence_handle(ref.current!, occurrence_id)
    return domRef?.(handle.current)
  }, [domRef, occurrence_id])
  useLayoutEffect(() => {
    const node = ref.current
    if (disabled && node && node === node.ownerDocument.activeElement) node.blur()
  }, [disabled])

  // Stable wrappers keep focus/capture when a transform or either clip toggles.
  return <g {...dom} style={domStyle} ref={ref} transform={transforms.join(' ')}
    data-gum-source={fragment.source_key} data-gum-occurrence={occurrence_id}
    clipPath={fragment.clip ? `url(#${id}-rect)` : undefined}>
    {(fragment.clip || fragment.clip_path !== undefined) && <defs>
      {fragment.clip && <clipPath id={`${id}-rect`} clipPathUnits="userSpaceOnUse">
        {rectangle(fragment.clip, fragment.clip.radius, output)}
      </clipPath>}
      {fragment.clip_path !== undefined && <clipPath id={`${id}-path`} clipPathUnits="userSpaceOnUse">
        <path d={output.path(fragment.clip_path)} />
      </clipPath>}
    </defs>}
    <g clipPath={fragment.clip_path !== undefined ? `url(#${id}-path)` : undefined}>
      <Content fragment={fragment} output={output} />
    </g>
  </g>
}, (a, b) => a.fragment === b.fragment && a.output === b.output
  && a.offset.x === b.offset.x && a.offset.y === b.offset.y
  && identity.every((value, i) => (a.transform?.[i] ?? value) === (b.transform?.[i] ?? value)))

// This component is also useful for embedding an already committed snapshot.
export function SvgScene({ snapshot, fonts }: { snapshot: GumSnapshot; fonts?: BrowserFonts }) {
  const { fragment, options, bindings } = snapshot
  const root_id = useId().replace(/[^\w-]/g, '_')
  const prefix = `${options.idPrefix ?? 'gum'}-${root_id}`
  const output = useMemo(() => make_output(options.precision, prefix, fonts), [options.precision, prefix, fonts])
  const prepared = useMemo(() => prepare_render(fragment), [fragment])
  const n = output.number
  const { width, height } = fragment.size
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(options.idPrefix ?? 'gum')) throw new TypeError('SVG idPrefix must be an identifier')
  return <Bindings.Provider value={bindings}>
    <svg xmlns="http://www.w3.org/2000/svg" width={n(width)} height={n(height)}
      viewBox={`0 0 ${n(width)} ${n(height)}`} overflow="hidden"
      textAnchor="start" fontWeight={400} fontStyle="normal" xmlSpace="preserve">
      {options.title !== undefined && <title>{options.title}</title>}
      {options.background !== undefined && <rect width={n(width)} height={n(height)} fill={options.background} />}
      <Occurrence fragment={prepared} offset={origin} output={output} />
    </svg>
  </Bindings.Provider>
}
