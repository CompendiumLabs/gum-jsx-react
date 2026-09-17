import Reconciler from 'react-reconciler'
import { createContext, type ReactNode } from 'react'
import { LayoutPass, make_size, type Size, type ThemeName } from '@gum-jsx/core'
import { createMathFonts } from '@gum-jsx/math'

import { renderContainer } from './runtime'
import { appendChild, createHostInstance, createHostText, insertBefore, removeChild } from './types'
import type {
  GumContainer,
  GumElementRegistry,
  GumFonts,
  GumHostChild,
  GumHostInstance,
  GumHostProps,
  GumHostText,
  GumHostType,
  GumSize,
} from './types'

const DEFAULT_EVENT_PRIORITY = 0
let currentUpdatePriority = DEFAULT_EVENT_PRIORITY
const HOST_CONTEXT = {}
const NOOP = () => {}

export interface GumRoot {
  container: GumContainer
  render: (children: ReactNode) => void
  unmount: () => void
  loadFonts: () => Promise<void>
  setSize: (size: GumSize) => void
  setTheme: (theme?: ThemeName) => void
  setElements: (elements?: GumElementRegistry) => void
  setProps: (props?: Record<string, unknown>) => void
  setRenderCallback: (fn?: (svg: string) => void) => void
  getSvg: () => string
  getSize: () => Size
}

export interface GumRootOptions {
  size?: GumSize
  theme?: ThemeName
  elements?: GumElementRegistry
  fonts?: GumFonts
  props?: Record<string, unknown>
  onRender?: (svg: string) => void
}

function normalizeType(type: string): GumHostType {
  return (type.startsWith('gum.') ? type : `gum.${type}`) as GumHostType
}

function isEqualProps(a: GumHostProps, b: GumHostProps): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every(key => a[key] === b[key])
}

function sizeEquals(a: GumSize, b: GumSize): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b
  const pair = (value: Exclude<GumSize, number>): readonly [number, number] =>
    'width' in value ? [value.width, value.height] : value
  const [aw, ah] = pair(a), [bw, bh] = pair(b)
  return aw === bw && ah === bh
}

function markRootDirty(node: GumHostChild): void {
  let current = node.parent
  while ((current as GumHostInstance | null)?.kind === 'instance') {
    current = (current as GumHostInstance).parent
  }
  if (current != null) (current as GumContainer).dirty = true
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

const hostConfig: any = {
  rendererVersion: '0.1.0',
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
  appendInitialChild: (parent: GumHostInstance, child: GumHostChild) => appendChild(parent, child),
  finalizeInitialChildren: () => false,
  prepareUpdate: (_instance: GumHostInstance, _type: string, oldProps: GumHostProps, newProps: GumHostProps) =>
    isEqualProps(oldProps, newProps) ? null : newProps,
  commitUpdate: (instance: GumHostInstance, _type: string, _oldProps: GumHostProps, newProps: GumHostProps) => {
    if (newProps != null) instance.props = newProps
    markRootDirty(instance)
  },
  commitTextUpdate: (textInstance: GumHostText, _oldText: string, newText: string) => {
    textInstance.text = newText
    markRootDirty(textInstance)
  },
  appendChild: (parent: GumHostInstance, child: GumHostChild) => {
    appendChild(parent, child)
    markRootDirty(parent)
  },
  appendChildToContainer: (container: GumContainer, child: GumHostChild) => {
    appendChild(container, child)
    container.dirty = true
  },
  insertBefore: (parent: GumHostInstance, child: GumHostChild, beforeChild: GumHostChild) => {
    insertBefore(parent, child, beforeChild)
    markRootDirty(parent)
  },
  insertInContainerBefore: (container: GumContainer, child: GumHostChild, beforeChild: GumHostChild) => {
    insertBefore(container, child, beforeChild)
    container.dirty = true
  },
  removeChild: (parent: GumHostInstance, child: GumHostChild) => {
    removeChild(parent, child)
    markRootDirty(parent)
  },
  removeChildFromContainer: (container: GumContainer, child: GumHostChild) => {
    removeChild(container, child)
    container.dirty = true
  },
  clearContainer: (container: GumContainer) => {
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
  getCurrentEventPriority: () => DEFAULT_EVENT_PRIORITY,
  trackSchedulerEvent: NOOP,
  resolveEventType: () => null,
  resolveEventTimeStamp: () => Date.now(),
  shouldAttemptEagerTransition: () => false,
  setCurrentUpdatePriority: (priority: number) => { currentUpdatePriority = priority },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => currentUpdatePriority,
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
    console.error, console.error, console.log, () => {},
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
  const {
    size = 500,
    theme = 'light',
    elements,
    fonts = createMathFonts(),
    props,
    onRender,
  } = options
  const container: GumContainer = {
    size, theme, elements, fonts,
    pass: new LayoutPass({ fonts: { value: fonts, version: fonts.version ?? 0 } }),
    props,
    rootChildren: [],
    currentSvg: '',
    currentSize: make_size(),
    dirty: true,
    onRender,
  }
  const internalRoot = createInternalRoot(container)

  const root: GumRoot = {
    container,
    render(children): void {
      updateInternalRoot(internalRoot, children)
      flushIfDirty(container)
      if (container.renderError != null) {
        const error = container.renderError
        container.renderError = undefined
        throw error
      }
    },
    unmount(): void {
      updateInternalRoot(internalRoot, null)
      flushIfDirty(container)
    },
    async loadFonts(): Promise<void> {
      await container.fonts.load?.()
      container.pass.set_resource('fonts', container.fonts, container.fonts.version ?? 0)
    },
    setSize(nextSize): void {
      if (sizeEquals(container.size, nextSize)) return
      container.size = nextSize
      container.dirty = true
      flushIfDirty(container)
    },
    setTheme(nextTheme): void {
      if (container.theme === nextTheme) return
      container.theme = nextTheme
      container.dirty = true
      flushIfDirty(container)
    },
    setElements(nextElements): void {
      if (container.elements === nextElements) return
      container.elements = nextElements
      container.dirty = true
      flushIfDirty(container)
    },
    setProps(nextProps): void {
      if (isEqualProps(container.props ?? {}, nextProps ?? {})) return
      container.props = nextProps
      container.dirty = true
      flushIfDirty(container)
    },
    setRenderCallback(fn): void { container.onRender = fn },
    getSvg: () => container.currentSvg,
    getSize: () => container.currentSize,
  }
  return root
}
