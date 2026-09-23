import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Circle as GumCircle, px } from '@gum-jsx/core'
import * as core from '@gum-jsx/core'
import * as math from '@gum-jsx/math'
import { createGumComponent, createGumRoot, GUM } from '../src/index'
import Scene from './component'

const ROOT = resolve(import.meta.dir, '..')
const CLI = './scripts/gum-react.tsx'
const { Circle, Field, Latex, Legend, LegendItem, MathChoice, MathText, Plot, Text } = GUM

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf-8' })
}

function assertPrimitives() {
  const elements = Object.entries({ ...core, ...math })
    .filter(([, value]) => typeof value === 'function'
      && value.prototype instanceof core.Element && value !== math.MathElement)
    .map(([name]) => name)
  assert.deepEqual(Object.keys(GUM).sort(), elements.sort(),
    'GUM must include every public concrete core and math element')
  assert.equal(typeof Circle, 'function')
  assert.equal(typeof Latex, 'function')
  assert.ok('MathRow' in GUM)
  assert.ok(!('NotAnElement' in GUM))
  assert.throws(() => createGumRoot().render(<GUM.NotAnElement />), /Unsupported gum primitive/)
}

function assertRendering() {
  const root = createGumRoot({ size: [400, 240] })
  root.render(<Scene />)
  assert.ok(root.getSvg().startsWith('<svg'))
  assert.deepEqual(root.getSize(), { width: 400, height: 240 })

  root.render(<Text font_size={px(24)}>React text</Text>)
  assert.ok(root.getSvg().includes('<path'), 'text should render as outlined glyphs')

  root.render(
    <Field
      width={px(100)}
      height={px(60)}
      vectors={[{ point: [0, 0], vector: [1, 1] }]}
      shape={() => <Circle fill="red" />}
    />,
  )
  assert.ok(root.getSvg().includes('fill="red"'), 'React elements returned by callbacks should convert')

  root.render(
    <Legend>
      <LegendItem badge_color="red" kind="bar">Observed</LegendItem>
      <LegendItem badge_color="blue">Predicted</LegendItem>
    </Legend>,
  )
  assert.ok(root.getSvg().includes('fill="red"'), 'legend items should render bar badges')
  assert.ok(root.getSvg().includes('stroke="blue"'), 'legend items should render line badges')

  root.render(
    <MathText style="script">
      <MathChoice>
        <MathText color="red">D</MathText>
        <MathText color="blue">T</MathText>
        <MathText color="green">S</MathText>
        <MathText color="purple">Q</MathText>
      </MathChoice>
    </MathText>,
  )
  assert.ok(root.getSvg().includes('fill="green"'), 'math choices should select the script branch')
  assert.ok(!/fill="(?:red|blue|purple)"/.test(root.getSvg()), 'unselected math branches should not render')
  root.unmount()
}

function assertUpdates() {
  const root = createGumRoot({ size: 100, theme: 'light' })
  root.render(<Circle />)
  const light = root.getSvg()
  root.setTheme('dark')
  assert.notEqual(root.getSvg(), light)
  root.setSize({ width: 160, height: 90 })
  assert.deepEqual(root.getSize(), { width: 160, height: 90 })
}

function assertNumericSize() {
  const root = createGumRoot({ size: 300 })
  root.render(<Plot aspect={1.5} />)
  assert.deepEqual(root.getSize(), { width: 300, height: 200 })

  root.setSize(150)
  assert.deepEqual(root.getSize(), { width: 150, height: 100 })

  root.setSize([300, 300])
  assert.deepEqual(root.getSize(), { width: 300, height: 300 })

  root.setSize(300)
  root.render(<Circle width={px(400)} height={px(200)} />)
  assert.deepEqual(root.getSize(), { width: 300, height: 150 })
  assert.ok(root.getSvg().includes('matrix(0.75 0 0 0.75 0 0)'))

  root.render(<Circle width={px(200)} height={px(400)} />)
  assert.deepEqual(root.getSize(), { width: 150, height: 300 })
}

function assertUniqueDefinitionIds() {
  const first = createGumRoot({ size: 100 })
  const second = createGumRoot({ size: 100 })
  first.render(<Circle />)
  second.render(<Circle />)

  const firstClip = first.getSvg().match(/<clipPath id="([^"]+)"/)?.[1]
  const secondClip = second.getSvg().match(/<clipPath id="([^"]+)"/)?.[1]
  assert.ok(firstClip)
  assert.ok(secondClip)
  assert.notEqual(firstClip, secondClip, 'separate React roots must not collide in one document')
}

function assertCustomElements() {
  class CustomCircle extends GumCircle {}
  const Custom = createGumComponent(CustomCircle)
  const direct = createGumRoot()
  direct.render(<Custom fill="red" />)
  assert.ok(direct.getSvg().includes('fill="red"'))

  const named = createGumRoot({ elements: { CustomCircle } })
  named.render(<GUM.CustomCircle fill="blue" />)
  assert.ok(named.getSvg().includes('fill="blue"'))
}

function assertCli() {
  const result = runCli(['test/component.tsx', '--size', '320'])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.ok(result.stdout.startsWith('<svg'))
  const viewport = result.stdout.match(/^<svg\b[^>]*>/)?.[0] ?? ''
  const width = Number(viewport.match(/\bwidth="([^"]+)"/)?.[1])
  const height = Number(viewport.match(/\bheight="([^"]+)"/)?.[1])
  assert.equal(width, 320)
  // The SVG serializer rounds output to ten decimal places.
  assert.ok(Math.abs(height - width / 1.5) < 1e-7)

  const dir = mkdtempSync(join(tmpdir(), 'gum-react-raw-'))
  try {
    writeFileSync(join(dir, 'message.txt'), 'raw import works', 'utf8')
    writeFileSync(join(dir, 'component.tsx'), `
      import message from './message.txt?raw'
      import { GUM } from '@gum-jsx/react'
      export default function Demo() { return <GUM.Text>{message}</GUM.Text> }
    `, 'utf8')
    const raw = runCli([join(dir, 'component.tsx')])
    assert.equal(raw.status, 0, raw.stderr || raw.stdout)
    assert.ok(raw.stdout.startsWith('<svg'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const test of [assertPrimitives, assertRendering, assertUpdates, assertNumericSize,
  assertUniqueDefinitionIds, assertCustomElements, assertCli]) {
  test()
  console.log(`ok — ${test.name}`)
}
