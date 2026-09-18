import { Children, type ReactElement, type ReactNode } from 'react'
import {
  Element as GumElement,
  Group,
  exact,
  make_request,
  px,
  render_element,
} from '@gum-jsx/core'
import type { SvgProps } from '@gum-jsx/core'

import { DEFAULT_ELEMENTS } from './elements'
import { GUM_CONSTRUCTOR_PROP } from './primitives'
import type {
  GumContainer,
  GumElementConstructor,
  GumHostChild,
  GumHostInstance,
  GumHostProps,
} from './types'

const RESERVED_PROPS = new Set([
  'children',
  'key',
  'ref',
  '__self',
  '__source',
  GUM_CONSTRUCTOR_PROP,
])

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

function ensureReactConvert<T>(value: T | ReactElement, container: GumContainer): T | GumElement | null {
  return isReactElement(value) ? reactElementToGum(value, container) : value
}

function toGumValue(value: unknown, container: GumContainer): unknown {
  if (typeof value === 'function') {
    return (...args: unknown[]) => ensureReactConvert((value as Function)(...args), container)
  }
  return ensureReactConvert(value, container)
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
    if (RESERVED_PROPS.has(key)) continue
    result[toGumKey(key)] = toGumValue(value, container)
  }
  return result
}

function instanceToGum(instance: GumHostInstance, container: GumContainer): GumElement {
  const constructor = getGumConstructor(container, instance.type, instance.props)
  const props = toGumProps(instance.props, container)
  const children = instance.children
    .map(child => toGumChild(child, container))
    .filter((child): child is GumElement | string => child != null)
  return new constructor(children.length > 0 ? { ...props, children } : props)
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
  const children = container.rootChildren
    .map(child => toGumChild(child, container))
    .filter((child): child is GumElement => child instanceof GumElement)
  const content = children.length === 1 ? children[0] : new Group({ children })
  const props = toGumProps((container.props ?? {}) as GumHostProps, container)
  const bounds = typeof container.size === 'number'
    ? { max_width: px(container.size), max_height: px(container.size) }
    : {}
  // Root props, bounds, and the container theme win over a source Svg's own props.
  // The shared pass keeps its cache; fonts loaded since the last render refresh it.
  const { svg, size } = render_element(content, {
    request: viewportRequest(container.size),
    overrides: { ...props, ...bounds, theme: container.theme } as SvgProps,
    id_prefix: container.idPrefix,
    pass: container.pass,
    fonts: container.fonts,
  })
  container.currentSvg = svg
  container.currentSize = size
  container.onRender?.(svg)
}
