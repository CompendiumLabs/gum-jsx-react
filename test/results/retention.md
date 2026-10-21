# Initial source-retention measurements

Measured on 2026-10-20 with Bun 1.4.3, production React, freezing disabled,
and an AMD Ryzen 9 7900X. These are **headless source-to-SVG measurements**;
browser DOM insertion, browser paint, first-load latency, and GC pauses during
long browser sessions have not been measured.

The fixture is the browser example: a 960 × 538 viewport, offline geography,
outlined labels, and 12-segment trails. Each case has 10 warmup updates and 40
measured updates. Baseline and retained runs were sequential in that order;
CPU frequency was not locked. Treat timings as initial observations, not a stable
cross-machine performance guarantee. Counters provide the structural evidence.

The baseline uses React package commit `c7ec2fc6bc5a580c2d9be76396bb48aba48c768a`
with stage timing/counters added, but without retained conversion or batching.
Both timing runs use the same fixture and bounded core cache. The retained run
uses the phase 0–1 working tree. [Recorded data](retention.json) includes p95
and the individual stages. Reproduce the current variant with `NODE_ENV=production
bun test/perf.tsx` from the React package.

| Units | Motion | Baseline median (ms) | Retained median (ms) | New host elements | Layouts |
| ---: | --- | ---: | ---: | ---: | ---: |
| 32 | none | 5.683 | 0.035 | 0 | 0 |
| 32 | one | 4.714 | 1.323 | 3 | 4 |
| 32 | all | 4.684 | 2.746 | 65 | 66 |
| 128 | none | 15.296 | 0.027 | 0 | 0 |
| 128 | one | 16.652 | 3.721 | 3 | 4 |
| 128 | all | 17.769 | 11.547 | 257 | 258 |
| 512 | none | 62.222 | 0.068 | 0 | 0 |
| 512 | one | 63.907 | 17.408 | 3 | 4 |
| 512 | all | 67.935 | 51.341 | 1025 | 1026 |

At 128 units, the baseline reconstructed 514 host elements and ran 515 layouts
even when only one unit moved. Retention reduces that update to three host
elements and four layouts. Serialization still traverses the full drawing.
No-op updates do no conversion, layout, serialization, or output callback.

Three complete 128-unit SVG frames also matched baseline output byte for byte
with identical definition prefixes, including non-default pan/zoom settings.

## Resize history

A separate process retained 32 circle sources, then rendered 1,600 distinct
fractional viewport widths. Heap measurements followed an explicit `Bun.gc(true)`.
Run `NODE_ENV=production bun test/resize.tsx` to repeat the retained-source probe.
The existing unbounded query cache grew from 9.8 MB to 89.6 MB; bounding each
element to 32 query results and 32 prepared entries stabilized the same probe
at about 13.5 MB. These values are JS heap bytes, not total process memory.
Existing results remain immutable; an evicted query recomputes exact geometry.

## Remaining baseline work

The production browser bundle builds, and a rasterized scene was visually checked.
Live controls, DOM timing, browser paint/allocation profiles, and a sustained
browser run await launching the example. Actual Deadlift trace fixtures remain
a later addition; this first example intentionally uses small deterministic tracks.
