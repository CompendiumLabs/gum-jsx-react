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

## Interaction and retained DOM

`<Gum>` renders fragments as React SVG nodes. Keyed sources retain their groups,
focus, and pointer capture across movement and sibling reordering. Unchanged
fragments skip drawing conversion; their path strings are weakly cached.

```tsx
<GUM.Group
  pos={[px(100), px(80)]}
  role="button"
  tabIndex={0}
  aria-label="Select unit"
  onClick={() => selectUnit(id)}
  onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectUnit(id)
    }
  }}
>
  <GUM.Circle width={px(24)} fill="transparent" stroke="none" pointerEvents="all" />
  <GUM.Circle width={px(8)} fill="teal" />
</GUM.Group>
```

Pointer, mouse, keyboard, focus, and wheel handlers use React SVG events;
`currentTarget` is the owning `SVGGElement`. DOM bubbling follows rendered
boundaries, including repeated placements. `pointerEvents`, `cursor`, `domStyle`,
`role`, `tabIndex`, `aria-*`, and `data-*` are host-only props. `disabled` removes
that boundary's handlers and tab stop, sets `aria-disabled`, and defaults its
pointer events to `none`. It does not disable separately opted-in descendants.

Use `event.currentTarget.setPointerCapture(event.pointerId)` for dragging and
handle `onPointerCancel` / `onLostPointerCapture`. Surviving groups retain capture;
removing a group lets the browser release it. Prevent touch scrolling where
appropriate with `domStyle={{ touchAction: 'none' }}`. Native SVG hit testing
respects paint order and clipping; use explicit transparent shapes or wider
strokes when a larger hit target is needed.

`local_point(svgElement, event)` converts client coordinates through the element's
screen matrix, including placements, fitting, the viewBox and CSS scaling. It
returns `null` for detached or singular elements. Choose the root SVG for viewport
coordinates or an occurrence's group for local coordinates.

`domRef` is an occurrence callback, independent of the custom renderer's internal
React ref. It receives a stable `GumHandle` with `id`, `element`, `localPoint`,
`focus`, `capturePointer`, and `releasePointer`. Return cleanup for that occurrence:

```tsx
<GUM.Group domRef={handle => {
  handles.set(handle.id, handle)
  return () => { handles.delete(handle.id) }
}}>
  <GUM.Circle />
</GUM.Group>
```

Memoize the callback to avoid detach/attach on callback changes. One source may
have several placements and therefore several handles; an object ref cannot
represent that relationship. Ref callbacks attach after DOM commit and clean up
on removal, callback replacement, and unmount (including Strict Mode replay).

Interaction initially belongs to elements that survive as layout boundaries.
Inline `Span` contents and generated items inside `Points`/map batches do not get
individual handlers or handles. Wrap authored items in separate elements when
those items need independent interaction. The scene is a separate React root:
application Context providers do not automatically cross into it. Pass values as
props or place providers inside `<Gum>`; output events bubble through the SVG DOM,
not through the authored component ancestry.

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
`<Gum>` accepts the same options and updates them without remounting its children.
For headless roots, `root.setRenderOptions(options)` replaces these settings;
omitted options return to their defaults. Uncaught component and layout errors
propagate from synchronous root calls, and `gum-react` exits unsuccessfully.

## Repeated updates

Unchanged host subtrees retain their core elements and can reuse the shared layout
pass. React keys preserve sibling identity across reordering. Treat data props,
element-valued props, and callback captures as immutable; replace changed values
and memoize stable arrays or records. Mutating an object in place does not request
an update. Construction callbacks are not called again solely because a parent
rerenders. Host `onX` bindings and refs are kept out of core source data; attaching
events to SVG output does not invalidate geometry. Binding changes publish a new
snapshot with the same fragment and matching committed handlers.

Update children and configuration together with the second `render` argument:

```tsx
root.render(<Scene />, {
  size: [800, 450],
  theme: 'light',
  title: 'Updated scene',
})
```

Supplied fields update together; omitted fields retain their values. The `props`
field replaces page props as a whole. An explicit `undefined` clears an optional
setting (`size` returns to 500 and `idPrefix` to the root's generated prefix). Existing setters
remain immediate; `setRenderOptions` still replaces the complete output options.
`<Gum>` uses the combined update path automatically.

`root.getFragment()` returns the latest immutable layout result, and
`root.getStats()` returns its render number, converted/reused source counts,
layout counters, and `conversion_ms`, `layout_ms`, and `svg_ms` timings. Before the
first output both return `undefined`; a no-op update leaves the latest result and
statistics unchanged. `root.getSvg()` serializes on demand and caches that export. A legacy
`onRender(svg, stats)` callback explicitly requests serialization after geometry
updates; `svg_ms` measures that work and is zero for the default DOM path.

`root.subscribe(listener)` and `root.getSnapshot()` expose coherent committed
fragments, output options, binding maps, and statistics. Binding-only changes
publish a new snapshot without changing layout statistics. No-op updates do not
notify subscribers. `<Gum>` subscribes in its output component, independently of
the scene-input lifecycle.

`<Gum onRender={stats => ...}>` runs after the SVG DOM commit and reports the
same counters plus `dom_ms`: elapsed output rendering through the layout effect,
including React reconciliation and DOM updates, excluding browser paint. For a
binding-only commit the geometry counters are zero.
These callbacks are for observation; avoid feeding each sample straight back into
the scene being measured. Browser paint is outside the recorded stage timings.

The [replay lab](example/README.md) provides a browser scene and a headless benchmark
for iterating on interactive rendering.

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

For live and mixed text, `<Gum>` registers the faces returned by `font_sources()`
with the browser as well as loading them for measurement. Registration is shared
by provider/document and released on unmount; distinct providers use separate
browser family names. A custom provider without `font_sources()` must arrange its
own browser fonts. Measurement fonts finish loading before browser registration,
so the two loaders do not compete for the same asset URLs during initialization.
All available faces are loaded at mount to avoid asynchronous font changes during
scene updates.

`onError` reports font, scene and layout failures. `<Gum>` displays an error until
corrected input succeeds. Synchronous headless errors still throw; root `onError`
also reports errors from independent hook updates. A failed layout never replaces
the last successful fragment/binding snapshot.

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
With the example server running, open `/test` for the browser contracts. They
check real DOM identity, events, focus, repeated placements, raster equivalence,
font ownership, Strict Mode, error recovery, and cleanup. `/test` is a development
route; the production example bundles only the replay lab.
