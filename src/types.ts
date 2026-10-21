import type { GumInteractionProps } from './interaction'
import type {
  Element, FontProvider, Fonts, Fragment, OutputPrecision, Size, TextRenderMode, ThemeName,
} from '@gum-jsx/core'
import type { LayoutPass } from '@gum-jsx/core'

export type GumHostType = `gum.${string}`
// A scalar is the maximum extent on either axis; pairs are exact dimensions.
export type GumSize = number | Size | readonly [width: number, height: number]
export type GumElementConstructor<Props extends object = Record<string, unknown>> =
  new (...args: any[]) => Element
export type GumElementRegistry = Readonly<Record<string, GumElementConstructor>>
export type GumFonts = FontProvider & Partial<Pick<Fonts, 'load' | 'version' | 'font_sources'>>

export interface GumRenderOptions {
  textMode?: TextRenderMode
  background?: string
  title?: string
  idPrefix?: string
  precision?: OutputPrecision
}

export interface GumHostProps {
  children?: unknown
  [key: string]: unknown
}

export interface GumHostText {
  kind: 'text'
  text: string
  parent: GumHostInstance | GumContainer | null
}

export interface GumHostInstance {
  kind: 'instance'
  source_key: string
  type: GumHostType
  props: GumHostProps
  children: GumHostChild[]
  parent: GumHostInstance | GumContainer | null
  element?: Element
  generation?: number
}

export type GumHostChild = GumHostInstance | GumHostText

// Per-render work, excluding the host callback and the browser's paint.
export interface GumRenderStats {
  render: number
  created: number
  reused: number
  queries: number
  layouts: number
  hits: number
  conversion_ms: number
  layout_ms: number
  svg_ms: number
}

// Geometry and browser bindings travel together; handlers never enter core data.
export type GumBindings = Readonly<GumInteractionProps & Record<string, unknown>>
export type GumSnapshot = Readonly<{
  revision: number
  fragment: Fragment
  bindings: ReadonlyMap<string, GumBindings>
  options: Readonly<GumRenderOptions>
  stats: GumRenderStats
}>

export interface GumContainer extends GumRenderOptions {
  idPrefix: string
  size: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts: GumFonts
  pass: LayoutPass
  props?: Record<string, unknown>
  rootChildren: GumHostChild[]
  currentSvg?: string
  snapshot?: GumSnapshot
  listeners: Set<() => void>
  bindings_dirty: boolean
  currentSize: Size
  currentFragment?: Fragment
  stats?: GumRenderStats
  generation: number
  values: WeakMap<object, unknown>
  created: number
  reused: number
  renderError?: unknown
  dirty: boolean
  onRender?: (svg: string, stats: GumRenderStats) => void
  onError?: (error: unknown) => void
}

// React owns child lists and host bindings; only source props enter core.
export function is_host_prop(key: string): boolean {
  return key === 'children' || key === 'key' || key === 'ref'
    || key === '__self' || key === '__source' || is_binding_prop(key)
}

export function is_binding_prop(key: string): boolean {
  return /^on[A-Z]/.test(key) || key.startsWith('aria-') || key.startsWith('data-')
    || ['role', 'tabIndex', 'pointerEvents', 'cursor', 'domStyle', 'disabled', 'domRef'].includes(key)
}

export function mark_bindings(node: GumHostInstance): void {
  let parent: GumHostInstance | GumContainer | null = node
  while (parent && 'kind' in parent) parent = parent.parent
  if (parent) parent.bindings_dirty = true
}

// Rebuild changed ancestors while leaving sibling source identities intact.
export function mark_dirty(node: GumHostChild | GumContainer): void {
  let current: GumHostChild | GumContainer | null = node
  while (current && 'kind' in current) {
    if (current.kind === 'instance') delete current.element
    current = current.parent
  }
  if (current) { current.dirty = true; current.bindings_dirty = true }
}

function isHostInstance(node: GumHostInstance | GumContainer): node is GumHostInstance {
  return (node as GumHostInstance).kind === 'instance'
}

let next_source = 0

export function createHostInstance(type: GumHostType, props: GumHostProps): GumHostInstance {
  return { kind: 'instance', source_key: `source-${next_source++}`, type, props, children: [], parent: null }
}

export function createHostText(text: string): GumHostText {
  return { kind: 'text', text, parent: null }
}

function detachFromParent(child: GumHostChild): void {
  const parent = child.parent
  if (parent == null) return
  const list = isHostInstance(parent) ? parent.children : parent.rootChildren
  const index = list.indexOf(child)
  if (index >= 0) list.splice(index, 1)
  mark_dirty(parent)
  child.parent = null
}

export function appendChild(parent: GumHostInstance | GumContainer, child: GumHostChild): void {
  detachFromParent(child)
  child.parent = parent
  if (isHostInstance(parent)) parent.children.push(child)
  else parent.rootChildren.push(child)
  mark_dirty(parent)
}

export function insertBefore(
  parent: GumHostInstance | GumContainer,
  child: GumHostChild,
  beforeChild: GumHostChild,
): void {
  detachFromParent(child)
  const list = isHostInstance(parent) ? parent.children : parent.rootChildren
  const index = list.indexOf(beforeChild)
  child.parent = parent
  if (index < 0) list.push(child)
  else list.splice(index, 0, child)
  mark_dirty(parent)
}

export function removeChild(parent: GumHostInstance | GumContainer, child: GumHostChild): void {
  const list = isHostInstance(parent) ? parent.children : parent.rootChildren
  const index = list.indexOf(child)
  if (index >= 0) list.splice(index, 1)
  if (child.parent === parent) child.parent = null
  mark_dirty(parent)
}
