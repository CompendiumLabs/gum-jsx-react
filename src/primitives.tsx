import { createElement, type ReactElement, type ReactNode } from 'react'
import type { CoordinatePosition, Element, PointsProps } from '@gum-jsx/core'

import { DEFAULT_ELEMENTS } from './elements'
import type { GumElementConstructor } from './types'

export const GUM_CONSTRUCTOR_PROP = '__gum_constructor__'

// Class-backed elements also expose a two-argument source descriptor overload.
// Only the ordinary props constructor describes a React primitive's input.
type PropsOf<C> = C extends new (...args: infer Args) => Element
  ? Extract<Args, [props?: object]> extends [props?: infer Props]
    ? Props extends object ? Props : Record<string, unknown>
    : Record<string, unknown>
  : Record<string, unknown>
// Match runtime conversion of nested elements and callback results. Callback
// arguments remain source data, preserving coordinate types for destructuring.
type ReactValue<T> = T extends Element ? T | ReactElement
  : T extends (...args: infer Args) => infer Result ? (...args: Args) => ReactValue<Result>
  : T extends object ? { [K in keyof T]: ReactValue<T[K]> } : T
type ReactProps<Props> = ReactValue<Omit<Props, 'children'>> & { children?: ReactNode }
export type GumPrimitiveComponent<Props extends object = Record<string, unknown>> =
  (props: ReactProps<Props>) => ReactElement

export function createGumComponent<C extends GumElementConstructor>(
  constructor: C,
  name = constructor.name,
): GumPrimitiveComponent<PropsOf<C>> {
  return function GumPrimitive(props: ReactProps<PropsOf<C>>) {
    return createElement<Record<string, unknown>>(`gum.${name}`, { ...props, [GUM_CONSTRUCTOR_PROP]: constructor }, props.children)
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
  readonly [K in keyof typeof DEFAULT_ELEMENTS]: K extends 'Points'
    ? <P extends CoordinatePosition = CoordinatePosition>(props: ReactProps<PointsProps<P>>) => ReactElement
    : GumPrimitiveComponent<PropsOf<typeof DEFAULT_ELEMENTS[K]>>
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
