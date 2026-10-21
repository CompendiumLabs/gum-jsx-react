import page from './index.html'
import { basename } from 'node:path'

const production = process.argv.includes('--production')
let routes: Record<string, Bun.HTMLBundle | Response> = { '/': page }

// Explicitly disable runtime freezing in the measured browser build.
if (production) {
  const build = await Bun.build({
    entrypoints: [new URL('./index.html', import.meta.url).pathname],
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"production"', __GUM_FREEZE__: 'false' },
  })
  if (!build.success) throw new AggregateError(build.logs, 'Example build failed')
  routes = Object.fromEntries(build.outputs.map(output => [
    basename(output.path) === 'index.html' ? '/' : `/${basename(output.path)}`,
    new Response(output, { headers: { 'Content-Type': output.type } }),
  ]))
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 3031),
  routes,
  development: production ? false : { hmr: true, console: true },
})

console.log(`Gum replay lab: ${server.url} (${production ? 'production' : 'development'})`)
