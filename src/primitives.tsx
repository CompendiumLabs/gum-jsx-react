import { createElement, type PropsWithChildren, type ReactElement } from 'react'
import type { Element } from '@gum-jsx/core'

import { DEFAULT_ELEMENTS } from './elements'
import type { GumElementConstructor } from './types'

export const GUM_CONSTRUCTOR_PROP = '__gum_constructor__'

type PropsOf<C> = C extends new (props?: infer Props) => Element
  ? Props extends object ? Props : Record<string, unknown>
  : Record<string, unknown>
export type GumPrimitiveComponent<Props extends object = Record<string, unknown>> =
  (props: PropsWithChildren<Props>) => ReactElement

export function createGumComponent<C extends GumElementConstructor>(
  constructor: C,
  name = constructor.name,
): GumPrimitiveComponent<PropsOf<C>> {
  return function GumPrimitive(props: PropsWithChildren<PropsOf<C>>) {
    return createElement(`gum.${name}`, { ...props, [GUM_CONSTRUCTOR_PROP]: constructor }, props.children)
  }
}

const CACHE = new Map<string, GumPrimitiveComponent>()

function getPrimitive(name: string): GumPrimitiveComponent {
  let primitive = CACHE.get(name)
  if (primitive == null) {
    const constructor = DEFAULT_ELEMENTS[name as keyof typeof DEFAULT_ELEMENTS]
    primitive = constructor == null
      ? function UnknownGumPrimitive(props) {
          return createElement(`gum.${name}`, props, props.children)
        }
      : createGumComponent(constructor as GumElementConstructor, name)
    CACHE.set(name, primitive)
  }
  return primitive
}

export type GumElements = {
  readonly [K in keyof typeof DEFAULT_ELEMENTS]: GumPrimitiveComponent<PropsOf<typeof DEFAULT_ELEMENTS[K]>>
} & {
  readonly [name: string]: GumPrimitiveComponent
}

const GUM: GumElements = new Proxy({} as GumElements, {
  get: (_target, key) => typeof key === 'string' ? getPrimitive(key) : undefined,
  has: (_target, key) => typeof key === 'string' && key in DEFAULT_ELEMENTS,
  ownKeys: () => Object.keys(DEFAULT_ELEMENTS),
  getOwnPropertyDescriptor: (_target, key) => {
    if (typeof key !== 'string' || !(key in DEFAULT_ELEMENTS)) return undefined
    return { value: getPrimitive(key), enumerable: true, configurable: true, writable: false }
  },
})

export { GUM }
