# @gum-jsx/react

React bindings for [gum-jsx](https://github.com/CompendiumLabs/gum-jsx). The package provides a custom renderer for headless SVG generation and a `<Gum>` component for React DOM applications.

```tsx
import { px } from '@gum-jsx/core'
import { createGumRoot, Gum, GUM } from '@gum-jsx/react'

const { Circle, HStack, Rect, Text } = GUM

export function Scene() {
  return (
    <HStack gap={px(20)}>
      <Rect fill="blue" />
      <Circle fill="red" />
      <Text>Hello</Text>
    </HStack>
  )
}

export function Figure() {
  return (
    <Gum size={{ width: 640, height: 360 }}>
      <Scene />
    </Gum>
  )
}
```

For headless rendering, create a root directly:

```tsx
const root = createGumRoot({ size: [640, 360], theme: 'dark' })
await root.loadFonts()
root.render(<Scene />)
console.log(root.getSvg())
```

`GUM` includes the core and math element classes. Wrap an application-defined element class with `createGumComponent`, or pass a named `elements` registry to a root.

The `gum-react` command renders a default-exported component to SVG:

```sh
bun gum-react figure.tsx --size 800 --theme dark > figure.svg
```
