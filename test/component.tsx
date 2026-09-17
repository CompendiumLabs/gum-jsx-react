import { pi, sin, blue } from '@gum-jsx/core'
import { GUM } from '../src/index'

const { Plot, SymLine } = GUM

export default function Scene() {
  return <Plot aspect={1.5} ylim={[-1.2, 1.2]}>
    <SymLine fy={sin} xlim={[0, 2 * pi]} stroke={blue} />
  </Plot>
}
