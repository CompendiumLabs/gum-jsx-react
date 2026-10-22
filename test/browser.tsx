import { act, StrictMode, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Evaluator, layout_element, render_svg, Fonts, define_element, element_children, make_fragment, place_fragment, make_size,
  draw_rect, draw_path, draw_image, make_rect, make_point, px,
} from '@gum-jsx/core'
import type { ElementProps, PathCommand } from '@gum-jsx/core'
import { Gum, GumFragment, GUM, createGumRoot, createGumComponent, local_point } from '../src/index'
import { SvgScene } from '../src/svg-dom'
import type { GumHandle } from '../src/index'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const result = document.getElementById('result')!
const fixtures = document.getElementById('fixtures')!
const logs: string[] = []
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
  logs.push(`PASS ${message}`)
  result.textContent = logs.join('\n')
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10))
const size = px(12)
const font_size = px(10)
const origin = [px(0), px(0)] as const
const shifted = [px(40), px(30)] as const
const points = [[px(0), px(0)], [px(150), px(100)]] as const

async function run() {
  const container = document.createElement('div')
  fixtures.append(container)
  const output = createRoot(container)
  const root = createGumRoot({ size: [320, 220], idPrefix: 'contract' })
  await root.loadFonts()
  function View() {
    const snapshot = useSyncExternalStore(root.subscribe, root.getSnapshot, root.getSnapshot)
    return snapshot ? <SvgScene snapshot={snapshot} /> : null
  }
  await act(async () => output.render(<View />))
  let clicked = '', cleaned = 0
  const handles = new Set<GumHandle>()
  const domRef = (handle: GumHandle) => { handles.add(handle); return () => { handles.delete(handle); cleaned++ } }
  const click = () => { clicked = 'old' }
  const keyboard = (event: { key: string }) => { clicked = event.key }
  function scene(ids = ['a', 'b'], moved = false, handler = click, disabled = false) {
    return <GUM.Group>
      <GUM.Polyline data-testid="static" points={points} stroke="teal" />
      {ids.map(id => <GUM.Group key={id} data-testid={id} pos={moved && id === 'a' ? shifted : origin}
        onClick={handler} onKeyDown={keyboard} tabIndex={0} role="button"
        aria-label={id} domRef={domRef} disabled={disabled}>
        <GUM.Circle width={size} fill={id === 'a' ? 'red' : 'blue'} />
        <GUM.Text font_size={font_size}>{id}</GUM.Text>
      </GUM.Group>)}
    </GUM.Group>
  }
  await act(async () => root.render(scene()))
  const a = container.querySelector<SVGGElement>('[data-testid="a"]')!
  const b = container.querySelector<SVGGElement>('[data-testid="b"]')!
  const circle = a.querySelector('ellipse')!
  const label = a.querySelector('path')!
  const map = container.querySelector('[data-testid="static"]')!
  const map_records: MutationRecord[] = []
  const map_observer = new MutationObserver(records => map_records.push(...records))
  map_observer.observe(map, { attributes: true, childList: true, subtree: true })
  let mutations: MutationRecord[] = []
  const observer = new MutationObserver(records => mutations.push(...records))
  observer.observe(container, { attributes: true, childList: true, subtree: true })
  const inspect = () => { mutations.push(...observer.takeRecords()) }
  const before = root.getSnapshot()
  check(root.container.currentSvg === undefined && root.getStats()!.svg_ms === 0, 'DOM rendering does not serialize a shadow SVG')
  await act(async () => { root.render(scene()); inspect() })
  check(root.getSnapshot() === before && mutations.length === 0, 'no-op preserves snapshot and performs no DOM mutations')
  a.focus()
  await act(async () => root.render(scene(['b', 'a'], true)))
  check(container.querySelector('[data-testid="a"]') === a && a.querySelector('ellipse') === circle
    && a.querySelector('path') === label, 'movement and keyed reorder retain group, marker and label nodes')
  check(document.activeElement === a, 'keyed reorder preserves keyboard focus')
  check(map_records.length + map_observer.takeRecords().length === 0, 'unrelated geography has no DOM mutations')
  check(handles.size === 2 && cleaned === 0, 'surviving occurrences retain their handles')
  const geometry = root.getFragment(), stats = root.getStats()
  await act(async () => root.render(scene(['b', 'a'], true, () => { clicked = 'new' })))
  check(root.getFragment() === geometry && root.getStats() === stats, 'handler-only changes publish without layout')
  await act(async () => a.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  check(clicked === 'new', 'events use the handler committed with the displayed snapshot')
  await act(async () => a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  check(String(clicked) === 'Enter', 'keyboard events reach focusable SVG boundaries')
  const screen = new DOMPoint(7, 9).matrixTransform(a.getScreenCTM()!)
  const local = local_point(a, { clientX: screen.x, clientY: screen.y })!
  check(Math.abs(local.x - 7) < 1e-6 && Math.abs(local.y - 9) < 1e-6, 'pointer coordinates account for rendered placement transforms')
  await act(async () => root.render(scene(['b', 'a'], true, click, true)))
  await act(async () => a.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  check(String(clicked) === 'Enter' && !a.hasAttribute('tabindex') && a.getAttribute('aria-disabled') === 'true',
    'disabled boundaries remove handlers and keyboard entry')
  await act(async () => root.render(scene(['b', 'c'])))
  check(!a.isConnected && container.querySelector('[data-testid="b"]') === b && cleaned === 1,
    'deleting and inserting siblings detaches only removed occurrences')
  check(local_point(a, { clientX: 0, clientY: 0 }) === null, 'detached handles have no local coordinate inverse')
  map_observer.disconnect(); observer.disconnect()

  // One source can be placed twice. The parent owns the two independent keys.
  const Repeat = createGumComponent(define_element<ElementProps & { reverse?: boolean }>('Repeat', (props, query) => {
    const child = query.child(element_children(props.children)[0], query.request)
    const placements = [place_fragment(child, [20, 20], undefined, 'left'), place_fragment(child, [160, 20], undefined, 'right')]
    return make_fragment({ size: make_size(320, 220), children: props.reverse ? placements.reverse() : placements })
  }))
  const repeat = (reverse = false) => <Repeat reverse={reverse}>
    <GUM.Circle data-testid="copy" width={size} fill="green" domRef={domRef} />
  </Repeat>
  await act(async () => root.render(repeat()))
  const copies = [...container.querySelectorAll('[data-testid="copy"]')]
  check(copies.length === 2 && handles.size === 2 && copies[0] !== copies[1], 'repeated fragments have separate DOM occurrences and handles')
  await act(async () => root.render(repeat(true)))
  const reversed = [...container.querySelectorAll('[data-testid="copy"]')]
  check(reversed[0] === copies[1] && reversed[1] === copies[0], 'explicit placement keys retain repeated content during reorder')

  const Alias = createGumComponent(define_element('Alias', (props, query) => query.child(element_children(props.children)[0], query.request)))
  let bubbling = ''
  await act(async () => root.render(<Alias onClick={() => { bubbling += 'parent' }}>
    <GUM.Circle data-testid="alias-child" onClick={() => { bubbling += 'child' }} />
  </Alias>))
  await act(async () => container.querySelector('[data-testid="alias-child"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  check(bubbling === 'childparent', 'custom elements returning a child preserve both interaction boundaries')

  const fitted = () => <GUM.Group data-testid="fitted" fit="contain" width={px(100)} height={px(100)}>
    <GUM.Circle data-testid="fitted-child" width={size} />
  </GUM.Group>
  await act(async () => root.render(fitted(), { size: [100, 100] }))
  const fitted_child = container.querySelector('[data-testid="fitted-child"]')!
  await act(async () => root.render(fitted(), { size: [200, 200] }))
  check(container.querySelector('[data-testid="fitted-child"]') === fitted_child, 'fitting through identity retains child DOM nodes')

  let set_color: (value: string) => void = () => {}
  function Stateful() {
    const [color, update] = useState('red'); set_color = update
    return <GUM.Circle data-testid="stateful" fill={color} />
  }
  await act(async () => root.render(<Stateful />))
  await act(async () => { set_color('purple'); await tick() })
  check(container.querySelector('[data-testid="stateful"] ellipse')?.getAttribute('fill') === 'purple',
    'internal hook updates publish through the same snapshot subscription')

  let failure: unknown
  const Failing = createGumComponent(define_element<ElementProps & { fail?: boolean }>('Failing', props => {
    if (props.fail) throw new Error('Expected layout failure')
    return make_fragment({ size: make_size(20, 20) })
  }))
  await act(async () => root.render(<Failing onClick={click} />))
  const good = root.getSnapshot()
  await act(async () => { try { root.render(<Failing fail onClick={() => {}} />) } catch (error) { failure = error } })
  check(!!failure && root.getSnapshot() === good, 'failed geometry leaves the displayed snapshot and bindings coherent')
  await act(async () => { try { root.render(<Failing fail onClick={() => {}} />) } catch {} })
  check(root.getSnapshot() === good, 'binding changes cannot publish a previously failed layout')
  await act(async () => root.render(<Failing />))
  check(root.getSnapshot() !== good, 'a corrected input recovers after layout failure')

  await drawing_contract(root, container)
  await act(async () => { output.unmount(); root.unmount() })
  check(handles.size === 0 && root.container.listeners.size === 0, 'unmount releases occurrence handles and snapshot listeners')
  container.remove()
  await canvas_contract()
  await fragment_contract()
  result.textContent = `${logs.join('\n')}\n\n${logs.length} checks passed.`
  result.dataset.status = 'passed'
}

async function raster(svg: string): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url })
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 220
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, 320, 220).data
  } finally { URL.revokeObjectURL(url) }
}

async function drawing_contract(root: ReturnType<typeof createGumRoot>, container: HTMLElement) {
  const paint = { fill: '#287f87', stroke: '#143f44', stroke_width: 2 }
  const commands: readonly PathCommand[] = [{ kind: 'M', x: 10, y: 80 }, { kind: 'C', x1: 30, y1: 5, x2: 70, y2: 130, x: 120, y: 65 }]
  const Shape = createGumComponent(define_element<ElementProps & { clip?: boolean }>('DrawingContract', props => make_fragment({
    size: make_size(150, 130),
    clip: props.clip ? { ...make_rect(0, 0, 140, 120), radius: { tl: make_point(15, 4), tr: make_point(), br: make_point(8, 8), bl: make_point() } } : undefined,
    clip_path: props.clip ? [{ kind: 'M', x: 0, y: 0 }, { kind: 'L', x: 150, y: 0 }, { kind: 'L', x: 120, y: 130 }, { kind: 'L', x: 0, y: 130 }, { kind: 'Z' }] : undefined,
    draw: [draw_rect(make_rect(0, 0, 150, 130), { ...paint, fill: '#e4eada' }, { tl: make_point(15, 4), tr: make_point(), br: make_point(8, 8), bl: make_point() }),
      draw_path(commands, { ...paint, fill: 'none', opacity: 0.6, stroke_dasharray: [4, 2] }),
      draw_image(make_rect(80, 80, 20, 20), 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')],
  })))
  function content(clip = true) { return <GUM.Group debug>
    <Shape data-testid="shapes" clip={clip} pos={[px(20), px(20)]} />
    <GUM.Circle pos={[px(240), px(60)]} width={px(30)} fill="orange" />
    <GUM.Text pos={[px(180), px(140)]} font_size={px(18)}>Outlined text</GUM.Text>
  </GUM.Group> }
  await act(async () => root.render(content(), { size: [320, 220], background: 'white', title: 'Drawing fidelity' }))
  const svg = container.querySelector('svg')!
  const serialized = root.getSvg()
  const actual = await raster(new XMLSerializer().serializeToString(svg))
  const expected = await raster(serialized)
  let difference = 0
  for (let i = 0; i < actual.length; i++) difference += Math.abs(actual[i] - expected[i])
  check(difference / actual.length < 0.25, `DOM/export raster parity for paths, corners, clips, images, outlines and debug (${(difference / actual.length).toFixed(4)})`)
  const target = container.querySelector('[data-testid="shapes"]')!
  const image = target.querySelector('image')
  const clip_id = target.getAttribute('clip-path')
  await act(async () => root.render(content(false)))
  check(container.querySelector('[data-testid="shapes"]') === target && target.querySelector('image') === image
    && !target.hasAttribute('clip-path'), 'changing clip state retains content and removes stale attributes')
  await act(async () => root.render(content()))
  check(target.getAttribute('clip-path') === clip_id, 'clip definition IDs remain stable when clips return')
}

async function canvas_contract() {
  const container = document.createElement('div'); fixtures.append(container)
  const output = createRoot(container)
  const before = document.fonts.size
  let commits = 0
  const fonts = new Fonts()
  const content = (first = true) => <StrictMode>
    {first && <Gum key="first" fonts={fonts} size={[180, 80]} textMode="live" idPrefix="shared" onRender={() => { commits++ }}>
      <GUM.Text data-testid="live">Live text</GUM.Text>
    </Gum>}
    <Gum key="second" fonts={fonts} size={[180, 80]} textMode="mixed" idPrefix="shared">
      <GUM.Group clip><GUM.Text>Second figure</GUM.Text></GUM.Group>
    </Gum>
  </StrictMode>
  await act(async () => output.render(content()))
  for (let i = 0; i < 500 && container.querySelectorAll('svg').length < 2; i++) await act(tick)
  check(container.querySelectorAll('svg').length === 2 && commits > 0, 'Strict Mode mounts independent live and mixed figures')
  const text = container.querySelector('text')!
  check(text.textContent?.includes('Live') && text.getAttribute('font-family')?.startsWith('gum-face-'), 'live text uses the registered measured font face')
  const ids = [...container.querySelectorAll('[id]')].map(node => node.id)
  check(new Set(ids).size === ids.length, 'multiple figures have unique definitions even with the same requested prefix')
  await act(async () => output.render(content(false)))
  check(container.querySelectorAll('svg').length === 1 && document.fonts.size > before,
    'removing one figure preserves font registrations shared by another')
  await act(async () => output.unmount())
  check(document.fonts.size === before, 'unmount releases browser font registrations')
  container.remove()

  // Failed initialization must settle, then accept corrected inputs without remounting the host.
  const errors = document.createElement('div'); fixtures.append(errors)
  const error_root = createRoot(errors)
  let failures = 0
  const onError = () => { failures++ }
  await act(async () => error_root.render(<Gum onError={onError}><GUM.Circle width={"invalid" as never} /></Gum>))
  for (let i = 0; i < 500 && !errors.querySelector('[role="alert"]'); i++) await act(tick)
  check(!!errors.querySelector('[role="alert"]') && failures === 1, 'initial layout failure reports once without an update loop')
  await act(async () => error_root.render(<Gum onError={onError}><GUM.Circle width={size} /></Gum>))
  check(!!errors.querySelector('ellipse') && !errors.querySelector('[role="alert"]'), 'mounted Gum recovers when failed input is corrected')
  await act(async () => error_root.unmount())
  errors.remove()
}

// Core evaluation can feed the public DOM component without a custom React root.
async function fragment_contract() {
  const container = document.createElement('div'); fixtures.append(container)
  const output = createRoot(container)
  const evaluator = new Evaluator()
  function evaluate(color: string) {
    const result = layout_element(evaluator.evaluate(`
      <Page width="320px" height="220px">
        <Box width="120px" height="90px" clip>
          <Circle fill="${color}" stroke="none" />
        </Box>
      </Page>
    `))
    if (result.kind !== 'fragment') throw new Error('Expected an evaluated figure')
    return result.fragment
  }
  try {
    const first = evaluate('red')
    await act(async () => output.render(<GumFragment fragment={first} background="white"
      title="Evaluated figure" idPrefix="evaluated" precision={3} className="figure" style={{ display: 'block' }} />))
    const svg = container.querySelector('svg')!
    const circle = svg.querySelector('ellipse')!
    check(svg.getAttribute('viewBox') === '0 0 320 220' && circle.getAttribute('fill') === 'red',
      'GumFragment renders evaluated core geometry directly')
    check(svg.classList.contains('figure') && svg.style.display === 'block'
      && svg.querySelector('title')?.textContent === 'Evaluated figure', 'fragment display options reach the root SVG')
    const actual = await raster(new XMLSerializer().serializeToString(svg))
    const expected = await raster(render_svg(first, { background: 'white', precision: 3 }))
    check(actual.every((value, index) => value === expected[index]), 'evaluated fragment DOM matches its SVG export pixels')
    const changed = evaluate('blue')
    await act(async () => output.render(<GumFragment fragment={changed} />))
    check(container.querySelector('svg') === svg && svg.querySelector('ellipse') === circle
      && circle.getAttribute('fill') === 'blue', 'fresh evaluated fragments update existing DOM nodes')
    check(!svg.querySelector('title') && !svg.hasAttribute('class') && !svg.style.display,
      'fragment updates clear removed output options')
    await act(async () => output.render(<>
      <GumFragment fragment={changed} idPrefix="shared" />
      <GumFragment fragment={changed} idPrefix="shared" />
    </>))
    const ids = [...container.querySelectorAll('[id]')].map(node => node.id)
    check(ids.length > 0 && new Set(ids).size === ids.length, 'shared fragments have independent clip definitions')
  } finally {
    await act(async () => output.unmount())
    container.remove()
  }
}

run().catch(error => {
  result.dataset.status = 'failed'
  result.textContent = `${logs.join('\n')}\n\nFAIL ${error.stack ?? error}`
  console.error(error)
})
