import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { Circle as GumCircle, px } from '@gum-jsx/core'
import { createGumComponent, createGumRoot, GUM } from '../src/index'
import Scene from '../test/component'

const ROOT = resolve(import.meta.dir, '..')
const CLI = './scripts/gum-react.tsx'
const { Circle, Field, Latex, Text } = GUM

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf-8' })
}

function assertPrimitives() {
  assert.ok(Object.keys(GUM).length > 0)
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
  assert.ok(result.stdout.includes('width="320"'))

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

for (const test of [assertPrimitives, assertRendering, assertUpdates, assertCustomElements, assertCli]) {
  test()
  console.log(`ok — ${test.name}`)
}
