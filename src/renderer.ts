import Reconciler from 'react-reconciler'
import { DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants'
import { version } from '../package.json'
import { createContext, type ReactNode } from 'react'
import { LayoutPass, make_size, type Fragment, type Size, type ThemeName } from '@gum-jsx/core'
import { createMathFonts } from '@gum-jsx/math'

import { renderContainer } from './runtime'
import {
  appendChild, createHostInstance, createHostText, insertBefore, removeChild, is_host_prop, mark_dirty,
} from './types'
import type {
  GumContainer,
  GumElementRegistry,
  GumFonts,
  GumHostInstance,
  GumHostProps,
  GumHostText,
  GumHostType,
  GumRenderOptions,
  GumRenderStats,
  GumSize,
} from './types'

let currentUpdatePriority: number = NoEventPriority
let nextRootId = 0
const HOST_CONTEXT = {}
const NOOP = () => {}

export interface GumRoot {
  container: GumContainer
  render: (children: ReactNode, options?: GumUpdateOptions) => void
  unmount: () => void
  loadFonts: () => Promise<void>
  setSize: (size: GumSize) => void
  setTheme: (theme?: ThemeName) => void
  setElements: (elements?: GumElementRegistry) => void
  setProps: (props?: Record<string, unknown>) => void
  setRenderOptions: (options: GumRenderOptions) => void
  setRenderCallback: (fn?: (svg: string, stats: GumRenderStats) => void) => void
  getSvg: () => string
  getSize: () => Size
  getFragment: () => Fragment | undefined
  getStats: () => GumRenderStats | undefined
}

export interface GumRootOptions extends GumRenderOptions {
  size?: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts?: GumFonts
  props?: Record<string, unknown>
  onRender?: (svg: string, stats: GumRenderStats) => void
}

// Supplied fields update together; omitted fields keep their current values.
export type GumUpdateOptions = Omit<GumRootOptions, 'fonts' | 'onRender'>

function normalizeType(type: string): GumHostType {
  return (type.startsWith('gum.') ? type : `gum.${type}`) as GumHostType
}

function isEqualProps(a: GumHostProps, b: GumHostProps): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
}

function sizeEquals(a: GumSize, b: GumSize): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b
  const pair = (value: Exclude<GumSize, number>): readonly [number, number] =>
    'width' in value ? [value.width, value.height] : value
  const [aw, ah] = pair(a), [bw, bh] = pair(b)
  return aw === bw && ah === bh
}

// Children are reconciled separately; host-only bindings never affect geometry.
function equal_source_props(a: GumHostProps, b: GumHostProps): boolean {
  const keys = Object.keys(a).filter(key => !is_host_prop(key))
  return keys.length === Object.keys(b).filter(key => !is_host_prop(key)).length
    && keys.every(key => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
}

function flushIfDirty(container: GumContainer): void {
  if (!container.dirty) return
  try {
    renderContainer(container)
  } catch (error) {
    container.renderError = error
  }
  container.dirty = false
}

// React commit callbacks record failures; synchronous root calls surface them.
function finish_render(container: GumContainer): void {
  flushIfDirty(container)
  if ('renderError' in container) {
    const error = container.renderError
    delete container.renderError
    throw error
  }
}

const hostConfig: any = {
  rendererVersion: version,
  rendererPackageName: '@gum-jsx/react',
  extraDevToolsConfig: null,
  now: Date.now,
  getRootHostContext: () => HOST_CONTEXT,
  getChildHostContext: () => HOST_CONTEXT,
  getPublicInstance: (instance: GumHostInstance) => instance,
  prepareForCommit: () => null,
  resetAfterCommit: (container: GumContainer) => flushIfDirty(container),
  shouldSetTextContent: () => false,
  createInstance: (type: string, props: GumHostProps) => createHostInstance(normalizeType(type), props),
  createTextInstance: (text: string) => createHostText(text),
  appendInitialChild: appendChild,
  finalizeInitialChildren: () => false,
  prepareUpdate: (_instance: GumHostInstance, _type: string, oldProps: GumHostProps, newProps: GumHostProps) =>
    isEqualProps(oldProps, newProps) ? null : newProps,
  commitUpdate: (instance: GumHostInstance, _type: string, _oldProps: GumHostProps, newProps: GumHostProps) => {
    const changed = !equal_source_props(instance.props, newProps)
    instance.props = newProps
    if (changed) mark_dirty(instance)
  },
  commitTextUpdate: (textInstance: GumHostText, _oldText: string, newText: string) => {
    textInstance.text = newText
    mark_dirty(textInstance)
  },
  appendChild,
  appendChildToContainer: appendChild,
  insertBefore,
  insertInContainerBefore: insertBefore,
  removeChild,
  removeChildFromContainer: removeChild,
  clearContainer: (container: GumContainer) => {
    for (const child of container.rootChildren) child.parent = null
    container.rootChildren = []
    container.dirty = true
    return false
  },
  preparePortalMount: NOOP,
  detachDeletedInstance: NOOP,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: false,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getCurrentEventPriority: () => DefaultEventPriority,
  trackSchedulerEvent: NOOP,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => Date.now(),
  shouldAttemptEagerTransition: () => false,
  setCurrentUpdatePriority: (priority: number) => { currentUpdatePriority = priority },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  // Hook updates outside an active event still need a schedulable priority.
  resolveUpdatePriority: () => currentUpdatePriority || DefaultEventPriority,
  maySuspendCommit: () => false,
  maySuspendCommitOnUpdate: () => false,
  maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: NOOP,
  suspendInstance: NOOP,
  waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null,
  NotPendingTransition: null,
  HostTransitionContext: createContext(null),
  resetFormInstance: NOOP,
  bindToConsole: () => null,
  supportsMicrotasks: true,
  supportsTestSelectors: false,
  resetTextContent: NOOP,
  hideInstance: NOOP,
  hideTextInstance: NOOP,
  unhideInstance: NOOP,
  unhideTextInstance: NOOP,
  commitMount: NOOP,
  beforeActiveInstanceBlur: NOOP,
  afterActiveInstanceBlur: NOOP,
  requestPostPaintCallback: (callback: (time: number) => void) => callback(Date.now()),
  scheduleMicrotask: (callback: () => void) => queueMicrotask(callback),
}

const GumReconciler = Reconciler(hostConfig)

function createInternalRoot(container: GumContainer): any {
  return GumReconciler.createContainer(
    container, 0, null, false, null, '',
    error => { container.renderError = error }, console.error, console.log, () => {},
  )
}

function updateInternalRoot(root: any, children: ReactNode, callback?: () => void): void {
  const reconciler = GumReconciler as any
  if (typeof reconciler.updateContainerSync === 'function') {
    reconciler.updateContainerSync(children, root, null, callback ?? null)
    reconciler.flushSyncWork?.()
  } else reconciler.updateContainer(children, root, null, callback ?? null)
}

export function createGumRoot(options: GumRootOptions = {}): GumRoot {
  // Retain a unique fallback when a caller later removes a custom prefix.
  const default_prefix = `gum-react-${nextRootId++}`
  const {
    size = 500,
    theme = 'light',
    elements,
    fonts = createMathFonts(),
    props,
    onRender,
    textMode,
    background,
    title,
    idPrefix = default_prefix,
    precision,
  } = options
  const container: GumContainer = {
    idPrefix, textMode, background, title, precision,
    size, theme, elements, fonts,
    pass: new LayoutPass({ fonts: { value: fonts, version: fonts.version ?? 0 } }),
    props,
    rootChildren: [],
    currentSvg: '',
    currentSize: make_size(),
    dirty: true,
    generation: 0, values: new WeakMap(), created: 0, reused: 0,
    onRender,
  }
  const internalRoot = createInternalRoot(container)

  // Configuration is applied before reconciling children, with one final output.
  function apply_options(options: GumUpdateOptions): void {
    for (const key of Object.keys(options) as (keyof GumUpdateOptions)[]) {
      let value = options[key]
      if (key === 'idPrefix' && value === undefined) value = default_prefix
      if (key === 'size' && value === undefined) value = 500
      const previous = container[key]
      const same = key === 'size' ? sizeEquals(previous as GumSize, value as GumSize)
        : key === 'props' ? isEqualProps(previous as GumHostProps ?? {}, value as GumHostProps ?? {})
        : Object.is(previous, value)
      if (same) continue
      Object.assign(container, { [key]: value })
      if (key === 'elements') {
        container.generation++
        container.values = new WeakMap()
      }
      container.dirty = true
    }
  }

  function configure(options: GumUpdateOptions): void {
    apply_options(options)
    finish_render(container)
  }

  const root: GumRoot = {
    container,
    render(children, options = {}): void {
      apply_options(options)
      updateInternalRoot(internalRoot, children)
      finish_render(container)
    },
    unmount(): void {
      root.render(null)
      container.values = new WeakMap()
    },
    async loadFonts(): Promise<void> {
      await container.fonts.load?.()
      container.pass.set_resource('fonts', container.fonts, container.fonts.version ?? 0)
      container.dirty = true
    },
    setSize: size => configure({ size }),
    setTheme: theme => configure({ theme }),
    setElements: elements => configure({ elements }),
    setProps: props => configure({ props }),
    // This setter replaces output settings; render's optional settings are a patch.
    setRenderOptions({ textMode, background, title, idPrefix = default_prefix, precision }): void {
      configure({ textMode, background, title, idPrefix, precision })
    },
    setRenderCallback(fn): void { container.onRender = fn },
    getSvg: () => container.currentSvg,
    getSize: () => container.currentSize,
    getFragment: () => container.currentFragment,
    getStats: () => container.stats,
  }
  return root
}
