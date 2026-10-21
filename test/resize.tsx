import { createGumRoot, GUM } from '../src/index'
import { px } from '@gum-jsx/core'

// Keep source identities alive while exercising a growing history of exact offers.
const root = createGumRoot({ size: [640, 400] })
const diameter = px(8)
root.render(
  <GUM.Group>
    {Array.from({ length: 32 }, (_, id) => <GUM.Circle key={id} width={diameter} />)}
  </GUM.Group>,
)
const samples: { widths: number; heap_bytes: number }[] = []
function measure(widths: number) {
  Bun.gc(true)
  samples.push({ widths, heap_bytes: process.memoryUsage().heapUsed })
}
measure(0)
for (let width = 1; width <= 1600; width++) {
  root.setSize([640 + width / 100, 400])
  if (width % 400 === 0) measure(width)
}
root.unmount()
console.log(JSON.stringify({ runtime: `Bun ${Bun.version}`, samples }, null, 2))
