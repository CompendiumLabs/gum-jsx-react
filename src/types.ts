import type { Element, FontProvider, Fonts, Size, ThemeName } from '@gum-jsx/core'
import type { LayoutPass } from '@gum-jsx/core'

export type GumHostType = `gum.${string}`
export type GumSize = number | Size | readonly [width: number, height: number]
export type GumElementConstructor<Props extends object = Record<string, unknown>> =
  new (...args: any[]) => Element
export type GumElementRegistry = Readonly<Record<string, GumElementConstructor>>
export type GumFonts = FontProvider & Partial<Pick<Fonts, 'load' | 'version'>>

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
  type: GumHostType
  props: GumHostProps
  children: GumHostChild[]
  parent: GumHostInstance | GumContainer | null
}

export type GumHostChild = GumHostInstance | GumHostText

export interface GumContainer {
  size: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts: GumFonts
  pass: LayoutPass
  props?: Record<string, unknown>
  rootChildren: GumHostChild[]
  currentSvg: string
  currentSize: Size
  renderError?: unknown
  dirty: boolean
  onRender?: (svg: string) => void
}

function isHostInstance(node: GumHostInstance | GumContainer): node is GumHostInstance {
  return (node as GumHostInstance).kind === 'instance'
}

export function createHostInstance(type: GumHostType, props: GumHostProps): GumHostInstance {
  return { kind: 'instance', type, props, children: [], parent: null }
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
  child.parent = null
}

export function appendChild(parent: GumHostInstance | GumContainer, child: GumHostChild): void {
  detachFromParent(child)
  child.parent = parent
  if (isHostInstance(parent)) parent.children.push(child)
  else parent.rootChildren.push(child)
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
}

export function removeChild(parent: GumHostInstance | GumContainer, child: GumHostChild): void {
  const list = isHostInstance(parent) ? parent.children : parent.rootChildren
  const index = list.indexOf(child)
  if (index >= 0) list.splice(index, 1)
  if (child.parent === parent) child.parent = null
}
