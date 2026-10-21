import { Children, type ReactElement, type ReactNode } from 'react'
import {
  Element as GumElement,
  Group,
  exact,
  make_request,
  px,
  layout_element,
  render_svg,
} from '@gum-jsx/core'
import type { PageProps } from '@gum-jsx/core'

import { DEFAULT_ELEMENTS } from './elements'
import { GUM_CONSTRUCTOR_PROP } from './primitives'
import { is_host_prop } from './types'
import type {
  GumContainer,
  GumElementConstructor,
  GumHostChild,
  GumHostInstance,
  GumHostProps,
} from './types'

function isReactElement(value: unknown): value is ReactElement {
  return value != null && typeof value === 'object'
    && '$$typeof' in value && 'type' in value && 'props' in value
}

function stripGumType(type: string): string {
  return type.startsWith('gum.') ? type.slice(4) : type
}

function getGumConstructor(
  container: GumContainer,
  type: string,
  props?: GumHostProps,
): GumElementConstructor {
  const direct = props?.[GUM_CONSTRUCTOR_PROP]
  if (typeof direct === 'function') return direct as GumElementConstructor
  const name = stripGumType(type)
  const constructor = container.elements?.[name]
    ?? DEFAULT_ELEMENTS[name as keyof typeof DEFAULT_ELEMENTS]
  if (constructor == null) throw new Error(`Unsupported gum primitive: ${name}`)
  return constructor as GumElementConstructor
}

function reactElementToGum(element: ReactElement, container: GumContainer): GumElement | null {
  if (typeof element.type === 'function') {
    const inner = (element.type as Function)(element.props)
    if (isReactElement(inner)) return reactElementToGum(inner, container)
    return null
  }
  if (typeof element.type !== 'string') {
    throw new Error(`Non-standard React element: ${String(element.type)}`)
  }

  const props = element.props as GumHostProps
  const constructor = getGumConstructor(container, element.type, props)
  const converted = toGumProps(props, container)
  const children = reactChildrenToGum(props.children as ReactNode, container)
  const args = children.length > 0 ? { ...converted, children } : converted
  return new constructor(args)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Props such as ticks and legends nest elements inside arrays and records.
// Untouched data keeps its identity, so lengths and plain values pass through as-is.
function convert_value(value: unknown, container: GumContainer): unknown {
  if (typeof value === 'function') {
    return (...args: unknown[]) => toGumValue((value as Function)(...args), container)
  }
  if (isReactElement(value)) return reactElementToGum(value, container)
  if (Array.isArray(value)) {
    const items = value.map(item => toGumValue(item, container))
    return items.some((item, i) => item !== value[i]) ? items : value
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, item]) => [key, toGumValue(item, container)] as const)
    return entries.some(([key, item]) => item !== value[key]) ? Object.fromEntries(entries) : value
  }
  return value
}

// Inputs are immutable, including callback captures. Cache only by identity.
function toGumValue(value: unknown, container: GumContainer): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value
  const key = value as object
  if (container.values.has(key)) return container.values.get(key)
  const converted = convert_value(value, container)
  container.values.set(key, converted)
  return converted
}

function toGumKey(key: string): string {
  return key.replace(/-/g, '_')
}

function reactNodeToGumChild(node: ReactNode, container: GumContainer): GumElement | string | null {
  if (node == null || typeof node === 'boolean') return null
  if (isReactElement(node)) return reactElementToGum(node, container)
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return null
}

function reactChildrenToGum(children: ReactNode, container: GumContainer): (GumElement | string)[] {
  return Children.toArray(children)
    .map(child => reactNodeToGumChild(child, container))
    .filter((child): child is GumElement | string => child != null)
}

function toGumProps(props: GumHostProps, container: GumContainer): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (is_host_prop(key) || key === GUM_CONSTRUCTOR_PROP) continue
    result[toGumKey(key)] = toGumValue(value, container)
  }
  return result
}

function instanceToGum(instance: GumHostInstance, container: GumContainer): GumElement {
  if (instance.element && instance.generation === container.generation) {
    container.reused++
    return instance.element
  }
  const constructor = getGumConstructor(container, instance.type, instance.props)
  const props = toGumProps(instance.props, container)
  const children = instance.children
    .map(child => toGumChild(child, container))
    .filter((child): child is GumElement | string => child != null)
  const element = new constructor(children.length > 0 ? { ...props, children } : props)
  instance.element = element
  instance.generation = container.generation
  container.created++
  return element
}

function toGumChild(child: GumHostChild, container: GumContainer): GumElement | string | null {
  return child.kind === 'text' ? child.text : instanceToGum(child, container)
}

function viewportRequest(size: GumContainer['size']) {
  if (typeof size === 'number') return make_request()
  const [width, height] = 'width' in size ? [size.width, size.height] : size
  return make_request({ width: exact(width), height: exact(height) })
}

export function renderContainer(container: GumContainer): void {
  const start = performance.now()
  container.created = 0
  container.reused = 0
  const children = container.rootChildren
    .map(child => toGumChild(child, container))
    .filter((child): child is GumElement => child instanceof GumElement)
  const content = children.length === 1 ? children[0] : new Group({ children })
  const props = toGumProps((container.props ?? {}) as GumHostProps, container)
  const bounds = typeof container.size === 'number'
    ? { max_width: px(container.size), max_height: px(container.size) }
    : {}
  // Root props, bounds, and the container theme win over a source Page's own props.
  // The shared pass keeps its cache; fonts loaded since the last render refresh it.
  const converted = performance.now()
  const before = container.pass.stats
  const { fragment } = layout_element(content, {
    request: viewportRequest(container.size),
    overrides: { ...props, ...bounds, theme: container.theme } as PageProps,
    text_mode: container.textMode,
    pass: container.pass,
    fonts: container.fonts,
  })
  const laid_out = performance.now()
  const after = container.pass.stats
  const svg = render_svg(fragment, {
    background: container.background, title: container.title,
    id_prefix: container.idPrefix, precision: container.precision,
  })
  const stats = Object.freeze({
    render: (container.stats?.render ?? 0) + 1,
    created: container.created, reused: container.reused,
    queries: after.queries - before.queries,
    layouts: after.layouts - before.layouts, hits: after.hits - before.hits,
    conversion_ms: converted - start, layout_ms: laid_out - converted,
    svg_ms: performance.now() - laid_out,
  })
  container.currentSvg = svg
  container.currentSize = fragment.size
  container.currentFragment = fragment
  container.stats = stats
  container.onRender?.(svg, stats)
}
