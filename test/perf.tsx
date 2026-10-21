import { cpus } from 'node:os'
import { FREEZE_ENABLED } from '@gum-jsx/core'
import { Scene } from '../example/scene'
import type { Motion } from '../example/scene'
import type { GumRoot } from '../src/index'

// An alternate checkout can supply the baseline renderer without a runtime mode.
const entry = process.env.GUM_REACT_ENTRY ?? new URL('../src/index.ts', import.meta.url).href
const { createGumRoot } = await import(entry)
const warmup = 10
const iterations = 40
const results = []
const fields = ['total_ms', 'conversion_ms', 'layout_ms', 'svg_ms',
  'created', 'reused', 'layouts', 'hits'] as const
type Sample = Record<typeof fields[number], number>

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(3))
}

for (const count of [32, 128, 512]) {
  for (const motion of ['none', 'one', 'all'] as Motion[]) {
    const root: GumRoot = createGumRoot({ size: [960, 538], idPrefix: 'perf' })
    // The comparison includes SVG serialization, now an explicit export request.
    root.setRenderCallback(() => {})
    await root.loadFonts()
    const samples: Sample[] = []
    for (let frame = -warmup; frame < iterations; frame++) {
      const before = root.container.stats
      const start = performance.now()
      root.render(
        <Scene time={(frame + warmup) / 30} count={count} motion={motion}
          width={960} height={538} zoom={1} pan={0} labels trails />,
      )
      const total_ms = performance.now() - start
      const stats = root.container.stats
      if (frame >= 0) samples.push({ total_ms, ...(stats && stats !== before ? stats : {
        created: 0, reused: 0, queries: 0, layouts: 0, hits: 0,
        conversion_ms: 0, layout_ms: 0, svg_ms: 0,
      }) })
    }
    const summary = Object.fromEntries(fields.map(field => [field, {
      median: quantile(samples.map(sample => sample[field]), 0.5),
      p95: quantile(samples.map(sample => sample[field]), 0.95),
    }]))
    results.push({ count, motion, ...summary })
    root.unmount()
    Bun.gc(true)
  }
}

console.log(JSON.stringify({ date: new Date().toISOString(), runtime: `Bun ${Bun.version}`,
  cpu: cpus()[0]?.model, revision: process.env.GUM_REVISION ?? null,
  production: process.env.NODE_ENV === 'production', freeze: FREEZE_ENABLED,
  warmup, iterations, viewport: [960, 538], labels: true, trails: true,
  note: 'Warm headless React → SVG. Excludes browser DOM insertion, paint, and first-load costs.', results }, null, 2))
