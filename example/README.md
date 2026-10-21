# Replay lab

A small browser example for the retained-rendering work in
[DOM.md](../../docs/DOM.md). It uses bundled geography and deterministic synthetic
tracks, so there are no map keys, external requests, or trace files to configure.

From `gum-jsx-react`:

```sh
bun run example
```

Open <http://127.0.0.1:3031>. The development command supports hot reload. For
measurements, stop that process and run the production build instead:

```sh
bun run example:production
```

Use `PORT=3032` to choose another port. Production explicitly disables Gum's
runtime freezing and uses production React. The footer shows both settings.

The default backend is retained SVG DOM. The **Backend** selector switches to the
old string-insertion path for comparisons of the same scene. Switching backends
remounts the scene and resets local drag offsets.

## Try these updates

- **Interaction:** select and drag a marker while playback continues. Tab focuses
  units; Enter/Space selects; arrow keys move (Shift uses a larger step). Reverse
  order, remove a selected unit, and restore units to exercise identity and cleanup.
  Drag and keyboard edits shift tracks and trails in longitude/latitude, so they
  stay anchored to the map through zoom, pan, and viewport changes.
- **No-op update:** refresh the same scene. Source conversion, layout, SVG output,
  and DOM insertion should all be zero after the initial render.
- **One unit:** animate one track while preserving the other source subtrees.
- **All units:** animate the full scene. Increase the count to see where SVG
  serialization and browser DOM replacement become dominant.
- **Time, zoom, pan, viewport:** scrub or change the view while paused or playing.
  These controls exercise the same Gum scene; they do not transform an independent
  handwritten SVG overlay.
- **Measure 180 frames / Save samples:** collect a short bounded run and export
  its measurements. Changing the workload clears the history. Each sample records
  its time and camera/viewport values.

The geography is deliberately a sibling of the unit overlays. Both use the same
projection and viewport. This lets the example expose source reuse before the
separate work to split geography from overlays inside `GeoMap` itself.

## Read the counters

`Created` counts host elements converted to new core elements. `Reused` counts
retained subtrees encountered by conversion, not all descendants inside them.
Layout and cache-hit counts are deltas from the shared `LayoutPass`.

The timing stages are source conversion, layout, SVG serialization, and synchronous
SVG DOM update. **Update to commit** also includes scheduling and React work.
**Frame interval** is the time between animation callbacks; manual updates are
excluded from that statistic. SVG DOM update includes output rendering and React commit (markup insertion in
the string baseline), but does not include later browser paint,
and the interval is not a precise presentation timestamp. Use browser performance
tools to inspect paint, allocation, and GC when investigating a bottleneck.

Retained mode does not serialize SVG during updates. Unchanged fragment output
and path strings are reused; groups survive movement and keyed reordering. Text
uses outlines. String mode still replaces changed SVG markup and has no element
interaction. The library also supports live/mixed text with browser font loading.

Open `/test` on the development server for the automated browser contracts.

## Headless comparison

The same scene has a repeatable source-to-SVG benchmark:

```sh
NODE_ENV=production bun test/perf.tsx > /tmp/gum-react-perf.json
NODE_ENV=production bun test/resize.tsx > /tmp/gum-react-resize.json
```

It measures 32, 128, and 512 units in all three motion modes, with 10 warmup updates
and 40 measured updates per case. It excludes browser work and cold font loading.
`GUM_REACT_ENTRY=/absolute/path/to/another/checkout/src/index.ts` selects a baseline
renderer; `GUM_REVISION=...` records its revision. Renderers without the new counters
still report total time, but their per-stage fields are zero.

See [the first results](../test/results/retention.md). Real Deadlift traces, browser
paint profiles, and a longer browser soak are follow-up baseline work; synthetic
headless timings do not establish viewer frame rates.
