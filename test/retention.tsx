import { strict as assert } from 'node:assert'
import { createElement, useState } from 'react'
import { Circle, Square, px } from '@gum-jsx/core'
import { createGumRoot, GUM } from '../src/index'
import type { GumHostInstance } from '../src/index'

// These contracts exercise the retained source boundary, independently of DOM output.
export async function assert_retention() {
  const diameter = px(12)
  const root = createGumRoot({ size: [240, 160] })
  let renders = 0
  root.setRenderCallback(() => { renders++ })
  const scene = (color = 'red', reverse = false) => (
    <GUM.Group>
      {(reverse ? ['b', 'a'] : ['a', 'b']).map(id => (
        <GUM.Circle key={id} width={diameter} fill={id === 'a' ? color : 'blue'} />
      ))}
    </GUM.Group>
  )
  root.render(scene())
  const group = root.container.rootChildren[0] as GumHostInstance
  const a = group.children[0] as GumHostInstance
  const b = group.children[1] as GumHostInstance
  const first = [a.element, b.element]
  const stats = root.getStats()

  root.render(scene())
  assert.equal(renders, 1, 'fresh JSX with unchanged source props is a no-op')
  assert.equal(root.getStats(), stats)
  assert.equal(a.element, first[0])
  root.render(scene('green'), { size: [320, 180], theme: 'dark', title: 'Together' })
  assert.equal(renders, 2, 'configuration and children commit one output')
  assert.notEqual(a.element, first[0])
  assert.equal(b.element, first[1], 'an unchanged sibling retains its core element')
  assert.deepEqual(root.getSize(), { width: 320, height: 180 })
  assert.ok(root.getSvg().includes('<title>Together</title>'))

  const changed = a.element
  root.render(scene('green', true))
  assert.equal(group.children[0], b)
  assert.equal(group.children[1], a)
  assert.equal(a.element, changed, 'a keyed reorder changes placement, not content')
  assert.equal(b.element, first[1])
  assert.ok(root.getStats()!.hits >= 2)
  const fresh = createGumRoot({ size: [320, 180], theme: 'dark', title: 'Together', idPrefix: root.container.idPrefix })
  fresh.render(scene('green', true))
  assert.equal(root.getSvg(), fresh.getSvg(), 'retention preserves fresh-render geometry and order')
  fresh.unmount()

  root.render(<GUM.Text>Before</GUM.Text>)
  const before = root.getSvg()
  root.render(<GUM.Text>After</GUM.Text>)
  assert.notEqual(root.getSvg(), before, 'host text changes invalidate the containing element')

  const handler = () => {}
  root.render(createElement('gum.Circle', { fill: 'red', onClick: handler }))
  const interactive = root.container.rootChildren[0] as GumHostInstance
  const element = interactive.element
  const bindings = renders
  root.render(createElement('gum.Circle', { fill: 'red', onClick: () => {} }))
  assert.equal(renders, bindings, 'host-only binding changes do not lay out geometry')
  assert.equal(interactive.element, element)
  assert.notEqual(interactive.props.onClick, handler, 'the committed binding remains current')

  const custom = createElement('gum.Custom', { width: diameter, fill: 'red' })
  root.render(custom, { elements: { Custom: Circle } })
  assert.ok(root.getSvg().includes('<ellipse'))
  root.render(custom, { elements: { Custom: Square } })
  assert.ok(!root.getSvg().includes('<ellipse'), 'registry changes invalidate retained conversions')

  let update: (value: string) => void = () => {}
  function Stateful() {
    const [color, set_color] = useState('red')
    update = set_color
    return <GUM.Circle fill={color} />
  }
  root.render(<Stateful />)
  update('purple')
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.ok(root.getSvg().includes('fill="purple"'), 'internal hook updates publish output')
  root.unmount()
  assert.equal(root.container.rootChildren.length, 0)
}
