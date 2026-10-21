import type { PointerEvent, KeyboardEvent } from 'react'
import { memo, useMemo, useRef, useState } from 'react'
import { px } from '@gum-jsx/core'
import { create_geo_projection, prepare_geo_source, world_countries } from '@gum-jsx/maps'
import { GUM, local_point } from '../src/index'

export type Motion = 'none' | 'one' | 'all'
export type SceneProps = {
  time: number
  count: number
  motion: Motion
  width: number
  height: number
  zoom: number
  pan: number
  labels: boolean
  trails: boolean
  selected?: number | null
  onSelect?: (id: number) => void
  reverse?: boolean
  hidden?: readonly number[]
}

// Bundled offline geography; the deterministic tracks are synthetic.
const source = world_countries({ ids: ['250', '276', '380', '756', '040', '705', '191'] })
const prepared = prepare_geo_source(source)
const dot_size = px(8)
const label_size = px(10)
const label_pos = [px(0), px(-15)] as const
const origin = [px(0), px(0)] as const
const line_width = px(1.5)
const hit_size = px(24)
const marker_stroke = px(1)
const selected_stroke = px(2)
const marker_style = { touchAction: 'none' } as const
const no_hidden: readonly number[] = []

function position(id: number, time: number): [number, number] {
  const phase = id * 2.399963229728653
  return [8 + 4.3 * Math.sin(phase + time * 0.035),
    46 + 2.5 * Math.cos(phase * 1.7 + time * 0.027)]
}

// A moving group retains the symbol and label's own source elements.
const Unit = memo(function Unit({ id, time, project, labels, trails, selected, onSelect }: {
  id: number; time: number; project: ReturnType<typeof create_geo_projection>
  labels: boolean; trails: boolean; selected: boolean; onSelect?: (id: number) => void
}) {
  const track = useMemo(() => position(id, time), [id, time])
  // Store edits in longitude/latitude so the map camera also moves edited tracks.
  const [offset, set_offset] = useState<[number, number]>([0, 0])
  const [dragged, set_dragged] = useState<[number, number] | null>(null)
  const drag = useRef<{ pointer: number; grab: [number, number] } | null>(null)
  const location = useMemo<[number, number]>(() => dragged ?? [
    track[0] + offset[0], track[1] + offset[1],
  ], [track, offset, dragged])
  const [x, y] = useMemo(() => project(location)!, [project, location])
  const pos = useMemo(() => [px(x), px(y)] as const, [x, y])

  // The lab's Mercator projection has an inverse from SVG pixels to geography.
  function drag_position(event: PointerEvent<SVGGElement>): [number, number] | null {
    const active = drag.current
    if (active?.pointer !== event.pointerId) return null
    const cursor = local_point(event.currentTarget.ownerSVGElement!, event)
    return cursor ? project.invert!([cursor.x - active.grab[0], cursor.y - active.grab[1]]) : null
  }

  // Capture belongs to the retained group. Playback can keep publishing scenes.
  function begin(event: PointerEvent<SVGGElement>) {
    if (event.button !== 0 || drag.current) return
    const cursor = local_point(event.currentTarget.ownerSVGElement!, event)
    if (!cursor) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointer: event.pointerId, grab: [cursor.x - x, cursor.y - y] }
    set_dragged(location)
    onSelect?.(id)
  }
  function move(event: PointerEvent<SVGGElement>) {
    const target = drag_position(event)
    if (target) set_dragged(target)
  }
  function finish(event: PointerEvent<SVGGElement>, cancelled = false) {
    const active = drag.current
    if (active?.pointer !== event.pointerId) return
    // Use the release position even if the last pointer move has not committed.
    const target = drag_position(event) ?? location
    drag.current = null
    if (!cancelled) set_offset([target[0] - track[0], target[1] - track[1]])
    set_dragged(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function keyboard(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(id); return }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 20 : 5
    set_offset(([dx, dy]) => {
      const point = project([track[0] + dx, track[1] + dy])!
      const target = project.invert!([point[0] + direction[0] * step, point[1] + direction[1] * step])!
      return [target[0] - track[0], target[1] - track[1]]
    })
    onSelect?.(id)
  }
  const [dx, dy] = dragged ? [dragged[0] - track[0], dragged[1] - track[1]] : offset
  const points = useMemo(() => trails ? Array.from({ length: 13 }, (_, index) => {
    const past = position(id, time - (12 - index) * 0.75)
    const point = project([past[0] + dx, past[1] + dy])!
    return [px(point[0]), px(point[1])] as const
  }) : [], [id, time, project, trails, dx, dy])
  const color = id % 2 ? '#bd594b' : '#237b83'

  return <>
    {trails && <GUM.Polyline points={points} stroke={color} stroke_width={line_width} opacity={0.45} />}
    <GUM.Group pos={pos} anchor="start" role="button" tabIndex={0}
      aria-label={`Unit ${id + 1}`} aria-pressed={selected} data-unit={id}
      cursor={dragged ? 'grabbing' : 'grab'} domStyle={marker_style}
      onPointerDown={begin} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
      onClick={() => onSelect?.(id)} onKeyDown={keyboard}>
      <GUM.Circle pos={origin} width={hit_size} fill="transparent" stroke="none" pointerEvents="all" />
      <GUM.Circle pos={origin} width={dot_size} fill={color} stroke={selected ? "#172f39" : "white"} stroke_width={selected ? selected_stroke : marker_stroke} />
      {labels && <GUM.Text pos={label_pos} font_size={label_size} color="#233d48">{`U${id + 1}`}</GUM.Text>}
    </GUM.Group>
  </>
})

export function Scene({ time, count, motion, width, height, zoom, pan, labels, trails,
  selected = null, onSelect, reverse = false, hidden = no_hidden }: SceneProps) {
  // Match the Mercator bounds to the viewport so the map fills it without bars.
  const bounds = useMemo(() => {
    const south = 46 - 5.5 / zoom, north = 46 + 5.5 / zoom
    const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))
    const half = (mercator(north) - mercator(south)) * 180 / Math.PI * width / height / 2
    return [8 + pan - half, south, 8 + pan + half, north] as const
  }, [zoom, pan, width, height])
  const view = useMemo(() => ({ projection: 'mercator' as const, bounds }), [bounds])
  const project = useMemo(() => create_geo_projection(prepared, view, width, height), [view, width, height])
  const dimensions = useMemo(() => ({ width: px(width), height: px(height) }), [width, height])

  const ids = Array.from({ length: count }, (_, id) => id).filter(id => !hidden.includes(id))
  if (reverse) ids.reverse()
  return (
    <GUM.Group clip>
      <GUM.GeoMap {...dimensions} source={source} projection="mercator" bounds={bounds}
        fill="#e3e7dc" background="#f7faf6" border_color="#bac8b6" />
      {ids.map(id => (
        <Unit key={id} id={id} time={motion === 'all' || (motion === 'one' && id === 0) ? time : 0}
          project={project} labels={labels} trails={trails} selected={selected === id} onSelect={onSelect} />
      ))}
    </GUM.Group>
  )
}
