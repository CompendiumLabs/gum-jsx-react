import { pi, sin } from '@gum-jsx/core'
import { GUM } from '../src/index'

const { Plot, SymLine } = GUM

export default function Scene() {
  return (
    <Plot xlim={[0, 2 * pi]} ylim={[-1.2, 1.2]} padding={0.1}>
      <SymLine fy={sin} stroke="blue" />
    </Plot>
  )
}
