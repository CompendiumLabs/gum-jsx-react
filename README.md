# @gum-jsx/react

[Gum](https://github.com/CompendiumLabs/gum-jsx) — installation, quickstart, and user documentation.

React bindings for Gum. The package provides a custom renderer for headless
SVG generation and a `<Gum>` component for React DOM applications.

Compatible React and React DOM versions are listed in the [peer dependencies](./package.json).

## React DOM

```tsx
import { px } from '@gum-jsx/core'
import { createGumRoot, Gum, GUM } from '@gum-jsx/react'

const { Circle, HStack, Rect, Text } = GUM

export default function Scene() {
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

The `GUM` components belong inside `<Gum>` or a Gum root. They describe Gum
elements through the custom renderer. Use underscore prop names such as
`font_size` and `stroke_width` in React TSX.

Use `pos={[x, y]}` or `pos={{x, y}}` for placement. Projected Graph children
also accept arbitrary numeric records. Projection callbacks receive the complete
record and return a record with final `x` and `y`, or null to hide a point:

```tsx
<GUM.Graph
  xlim={[-1, 1]} ylim={[-1, 1]}
  projection={({ theta, r }) => ({ x: r * Math.cos(theta), y: r * Math.sin(theta) })}
>
  <GUM.Points
    points={[{ theta: Math.PI / 4, r: 0.8 }]}
    point_size={({ r }) => px(8 * r)}
  />
  <GUM.Text pos={{ theta: Math.PI / 4, r: 1 }} anchor="center">45°</GUM.Text>
</GUM.Graph>
```

Callbacks retain contextual TypeScript types, including Points fields inferred
from its input records. React elements also work in element-valued props and
callback results.

## Headless SVG

Using `Scene` from the example above, create a root directly:

```tsx
const root = createGumRoot({ size: [640, 360], theme: 'dark' })
await root.loadFonts()
root.render(<Scene />)
console.log(root.getSvg())
root.unmount()
```

A numeric `size` is the maximum extent on either axis. Content reflows within
those offers, then the completed figure scales down uniformly if necessary,
including both dimensions, fonts, and strokes. Pass `[width, height]` or
`{ width, height }` for exact viewport dimensions instead.

Roots also accept `textMode`, `background`, `title`, `idPrefix`, and `precision`
options. For example, `createGumRoot({ textMode: 'live' })` keeps text selectable.

## Fonts and emoji

Text is outlined by default, so figures need no page fonts. Emoji are the exception: core
measures them with a bundled metrics face and keeps them as live SVG text in the
family `Noto Color Emoji`. `<Gum>` renders inline, so the page's own `@font-face`
rule paints them. Without one, the viewer's emoji font is used, with each emoji
centered in its measured advance.

```css
@font-face {
  font-family: 'Noto Color Emoji';
  src: url('@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2') format('woff2');
}
```

Use that complete file. The package's unicode-range slices are OpenType-SVG only,
which Chrome does not paint. Keep the family out of the page's own font stacks, and
the browser fetches it only once a figure contains an emoji.

A custom `fonts` value is an effect dependency of `<Gum>`. Create it once, outside
the component or in `useMemo`, or every render rebuilds the root and reloads fonts.

`GUM` includes the core and math element classes and `GUM.GeoMap` from
`@gum-jsx/maps`. Import map data helpers such as `world_countries` and `us_states`
from `@gum-jsx/maps`. Wrap an application-defined element class with
`createGumComponent`, or pass a named `elements` registry to a root.

## Command line

Save the first example as `figure.tsx`. The `gum-react` command renders its
default-exported `Scene` component to SVG.

```sh
bun run --silent gum-react figure.tsx --size 800 --theme dark --text-mode live -o figure.svg
```

The CLI's numeric `--size` likewise sets the maximum output dimension.
It accepts `--cwd` to choose the base directory for relative
`?raw` imports and passes the selected `theme` to the exported component.

The standard Gum SVG options are also available:

- `--text-mode path|live|mixed`: outline text (the default), keep prose and math
  as SVG text, or keep prose as text while outlining math. Live text uses the
  viewer's fonts.
- `-o, --output <file>`: write SVG to a file; otherwise print it to stdout.
- `-b, --background <color>`: paint the viewport background.
- `--title <text>`: set the SVG document title.
- `--id-prefix <name>`: choose the prefix for SVG definition IDs.
- `--precision <digits|full>`: choose 0–100 decimal places or full precision
  (default: 10).

## Development

Run `bun run test` and `bun run typecheck` from this package directory.
