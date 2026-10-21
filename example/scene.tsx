import { memo, useMemo } from 'react'
import { px } from '@gum-jsx/core'
import { create_geo_projection, prepare_geo_source, world_countries } from '@gum-jsx/maps'
import { GUM } from '../src/index'

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
}

// Bundled offline geography; the deterministic tracks are synthetic.
const source = world_countries({ ids: ['250', '276', '380', '756', '040', '705', '191'] })
const prepared = prepare_geo_source(source)
const dot_size = px(8)
const label_size = px(10)
const label_pos = [px(0), px(-15)] as const
const origin = [px(0), px(0)] as const
const line_width = px(1.5)

function position(id: number, time: number): [number, number] {
  const phase = id * 2.399963229728653
  return [8 + 4.3 * Math.sin(phase + time * 0.035),
    46 + 2.5 * Math.cos(phase * 1.7 + time * 0.027)]
}

// A moving group retains the symbol and label's own source elements.
const Unit = memo(function Unit({ id, time, project, labels, trails }: {
  id: number; time: number; project: (point: [number, number]) => [number, number] | null
  labels: boolean; trails: boolean
}) {
  const point = useMemo(() => project(position(id, time))!, [id, time, project])
  const pos = useMemo(() => [px(point[0]), px(point[1])] as const, [point])
  const points = useMemo(() => trails ? Array.from({ length: 13 }, (_, index) => {
    const p = project(position(id, time - (12 - index) * 0.75))!
    return [px(p[0]), px(p[1])] as const
  }) : [], [id, time, project, trails])
  const color = id % 2 ? '#bd594b' : '#237b83'

  return <>
    {trails && <GUM.Polyline points={points} stroke={color} stroke_width={line_width} opacity={0.45} />}
    <GUM.Group pos={pos} anchor="start">
      <GUM.Circle pos={origin} width={dot_size} fill={color} stroke="white" />
      {labels && <GUM.Text pos={label_pos} font_size={label_size} color="#233d48">{`U${id + 1}`}</GUM.Text>}
    </GUM.Group>
  </>
})

export function Scene({ time, count, motion, width, height, zoom, pan, labels, trails }: SceneProps) {
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

  return (
    <GUM.Group clip>
      <GUM.GeoMap {...dimensions} source={source} projection="mercator" bounds={bounds}
        fill="#e3e7dc" background="#f7faf6" border_color="#bac8b6" />
      {Array.from({ length: count }, (_, id) => (
        <Unit key={id} id={id} time={motion === 'all' || (motion === 'one' && id === 0) ? time : 0}
          project={project} labels={labels} trails={trails} />
      ))}
    </GUM.Group>
  )
}
