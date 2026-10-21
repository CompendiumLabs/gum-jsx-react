import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FREEZE_ENABLED } from '@gum-jsx/core'
import { Gum } from '../src/index'
import type { GumRenderStats } from '../src/index'
import { Scene } from './scene'
import { StringGum } from './string'
import type { Motion } from './scene'

type RenderSample = GumRenderStats & { dom_ms: number }
type Sample = Omit<RenderSample, 'render'> & {
  update_ms: number; interval_ms: number; time: number; width: number; height: number; zoom: number; pan: number
}
const empty = { created: 0, reused: 0, queries: 0, layouts: 0, hits: 0,
  conversion_ms: 0, layout_ms: 0, svg_ms: 0, dom_ms: 0 }
const timings = ['update_ms', 'conversion_ms', 'layout_ms', 'svg_ms', 'dom_ms', 'interval_ms'] as const
const names = ['Update to commit', 'Source conversion', 'Layout', 'SVG serialization', 'SVG DOM update', 'Frame interval']

function percentile(samples: Sample[], field: keyof Sample, fraction: number): number {
  const values = samples.map(sample => sample[field])
    .filter(value => field !== 'interval_ms' || value > 0).sort((a, b) => a - b)
  return values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0
}

function App() {
  const [frame, set_frame] = useState({ tick: 0, time: 0 })
  const [playing, set_playing] = useState(false)
  const [count, set_count] = useState(32)
  const [motion, set_motion] = useState<Motion>('one')
  const [width, set_width] = useState(960)
  const [zoom, set_zoom] = useState(1)
  const [pan, set_pan] = useState(0)
  const [labels, set_labels] = useState(true)
  const [trails, set_trails] = useState(true)
  const [report, set_report] = useState<Sample[]>([])
  const [ready, set_ready] = useState(false)
  const [backend, set_backend] = useState<'dom' | 'svg'>('dom')
  const [selected, set_selected] = useState<number | null>(null)
  const [hidden, set_hidden] = useState<number[]>([])
  const [reverse, set_reverse] = useState(false)
  const [error, set_error] = useState<unknown>(null)
  const Figure = backend === 'dom' ? Gum : StringGum
  const samples = useRef<Sample[]>([])
  const pending = useRef<{ start: number; work: typeof empty; interval: number } | null>(null)
  const remaining = useRef<number | null>(null)
  const height = Math.round(width * 0.56)
  const size = useMemo(() => [width, height] as const, [width, height])

  // Bound history; a UI refresh must not itself create another measured frame.
  useEffect(() => {
    const timer = setInterval(() => set_report([...samples.current]), 500)
    return () => clearInterval(timer)
  }, [])

  function advance(time: number, interval = 0) {
    pending.current = { start: performance.now(), work: { ...empty }, interval }
    set_frame(value => ({ tick: value.tick + 1, time }))
  }

  useEffect(() => {
    if (!playing) return
    let id = 0
    let previous = performance.now()
    const step = (now: number) => {
      const interval = now - previous
      previous = now
      pending.current = { start: performance.now(), work: { ...empty }, interval }
      set_frame(value => ({ tick: value.tick + 1, time: (value.time + interval / 1000) % 180 }))
      if (remaining.current !== null && --remaining.current <= 0) {
        remaining.current = null
        set_playing(false)
      } else id = requestAnimationFrame(step)
    }
    id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [playing])

  // Output subscriptions can commit after the input layout effect. Finish after
  // the synchronous React work, including no-op frames that publish no snapshot.
  useLayoutEffect(() => {
    const update = pending.current
    if (!update) return
    queueMicrotask(() => {
      if (pending.current !== update) return
      samples.current.push({ ...update.work, update_ms: performance.now() - update.start,
        interval_ms: update.interval, time: frame.time, width, height, zoom, pan })
      if (samples.current.length > 300) samples.current.shift()
      pending.current = null
    })
  }, [frame])

  function record(stats: RenderSample) {
    const work = pending.current?.work
    if (work) for (const key of Object.keys(empty) as (keyof typeof empty)[]) work[key] += stats[key]
    if (!ready) set_ready(true)
  }

  // A different workload starts a new series; camera/viewport values travel with samples.
  function change_workload(change: () => void) {
    samples.current = []
    set_report([])
    change()
    advance(frame.time)
  }

  function measure() {
    samples.current = []
    set_report([])
    remaining.current = 180
    set_playing(true)
  }

  function download() {
    const result = { date: new Date().toISOString(), user_agent: navigator.userAgent,
      production: process.env.NODE_ENV === 'production', freeze: FREEZE_ENABLED,
      scene: { backend, count, motion, width, height, zoom, pan, labels, trails, hidden, reverse },
      note: 'Warm synthetic replay. Update ends at React commit; SVG DOM update includes output rendering and commit, but excludes browser paint.',
      samples: samples.current }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'gum-replay.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const last = report.at(-1)
  return (
    <main>
      <header><div><p className="eyebrow">GUM / REACT</p><h1>Replay lab</h1></div>
        <p>A small, offline scene for improving interactive rendering.</p></header>
      <section className="controls" aria-label="Replay controls">
        <label>Backend<select value={backend} onChange={event => change_workload(() => {
          set_playing(false); set_ready(false); set_backend(event.target.value as 'dom' | 'svg')
        })}><option value="dom">Retained DOM</option><option value="svg">SVG string baseline</option></select></label>
        <button disabled={!ready} onClick={() => { remaining.current = null; set_playing(!playing) }}>{playing ? 'Pause' : 'Play'}</button>
        <button disabled={!ready || playing} onClick={() => advance(frame.time)}>No-op update</button>
        <button disabled={!ready || playing} onClick={measure}>Measure 180 frames</button>
        <label>Units<select value={count} onChange={event => change_workload(() => set_count(Number(event.target.value)))}>
          {[32, 128, 512].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Motion<select value={motion} onChange={event => change_workload(() => set_motion(event.target.value as Motion))}>
          <option value="none">None</option><option value="one">One unit</option><option value="all">All units</option></select></label>
        <label><input type="checkbox" checked={labels} onChange={event => change_workload(() => set_labels(event.target.checked))} />Labels</label>
        <label><input type="checkbox" checked={trails} onChange={event => change_workload(() => set_trails(event.target.checked))} />Trails</label>
      </section>
      <div className="workspace">
        <section className="scene">
          <div className="scene-bar"><span>{error ? String(error) : ready ? `${count - hidden.filter(id => id < count).length} synthetic tracks · Europe` : 'Loading fonts…'}</span><span>{frame.time.toFixed(1)} s</span></div>
          <Figure size={size} onRender={record} onError={set_error}>
            <Scene time={frame.time} count={count} motion={motion} width={width} height={height}
              zoom={zoom} pan={pan} labels={labels} trails={trails}
              selected={selected} onSelect={set_selected} hidden={hidden} reverse={reverse} />
          </Figure>
          <label className="scrub">Time<input aria-label="Time" type="range" min="0" max="180" step="0.1" value={frame.time}
            onChange={event => { set_playing(false); advance(Number(event.target.value)) }} /></label>
        </section>
        <aside>
          <h2>Interaction</h2>
          <p className="muted">{backend === 'dom' ? 'Click or drag a unit, including during playback. Tab to focus; arrow keys move it.' : 'The string baseline replaces SVG nodes. Switch to retained DOM for interaction.'}</p>
          <p className="selection">{selected === null ? 'No unit selected' : `Selected: U${selected + 1}`}</p>
          <div className="actions">
            <button onClick={() => set_reverse(value => !value)}>Reverse order</button>
            <button disabled={selected === null} onClick={() => { set_hidden(ids => [...ids, selected!]); set_selected(null) }}>Remove selected</button>
            <button disabled={!hidden.length} onClick={() => set_hidden([])}>Restore units</button>
          </div>
          <h2>Render work</h2><p className="muted">Last {report.length} updates · milliseconds</p>
          <table><thead><tr><th>Stage</th><th>Median</th><th>p95</th></tr></thead><tbody>
            {timings.map((field, index) => <tr key={field}><td>{names[index]}</td>
              <td>{percentile(report, field, 0.5).toFixed(2)}</td><td>{percentile(report, field, 0.95).toFixed(2)}</td></tr>)}
          </tbody></table>
          <dl><div><dt>Created elements / reused subtrees</dt><dd>{last?.created ?? 0} / {last?.reused ?? 0}</dd></div>
            <div><dt>Layouts / cache hits</dt><dd>{last?.layouts ?? 0} / {last?.hits ?? 0}</dd></div></dl>
          <p className="muted">SVG DOM update includes output rendering and React commit (markup insertion in the baseline). Browser paint is additional.</p>
          <button onClick={download} disabled={!report.length}>Save samples</button>
          <h2>View</h2>
          <label className="slider">Zoom <output>{zoom.toFixed(1)}×</output><input aria-label="Zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => { set_zoom(Number(event.target.value)); advance(frame.time) }} /></label>
          <label className="slider">Pan<input aria-label="Pan" type="range" min="-4" max="4" step="0.1" value={pan} onChange={event => { set_pan(Number(event.target.value)); advance(frame.time) }} /></label>
          <label className="slider">Viewport <output>{width} × {height}</output><input aria-label="Viewport width" type="range" min="640" max="1280" step="1" value={width} onChange={event => { set_width(Number(event.target.value)); advance(frame.time) }} /></label>
        </aside>
      </div>
      <footer>{backend === 'dom' ? 'Retained SVG DOM' : 'SVG string baseline'} · {process.env.NODE_ENV} · freezing {FREEZE_ENABLED ? 'on' : 'off'} · paths for text · no external map requests</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
