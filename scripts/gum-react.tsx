#!/usr/bin/env bun

import type { BuildArtifact, BunPlugin } from 'bun'
import { program } from 'commander'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { ComponentType } from 'react'
import type { ThemeName } from '@gum-jsx/core'
import { createGumRoot } from '@gum-jsx/react'

interface CliOptions {
  size: number
  theme: ThemeName
  cwd?: string
}

interface ComponentProps {
  theme: ThemeName
}

interface ComponentModule {
  default?: ComponentType<ComponentProps>
}

interface LoadedComponentBundle {
  Component: ComponentType<ComponentProps>
  cleanup: () => void
}

const PROVIDED_PACKAGES = [
  'react',
  '@gum-jsx/react',
  '@gum-jsx/core',
  '@gum-jsx/math',
] as const
const PROVIDED_FILTER = new RegExp(
  `^(${PROVIDED_PACKAGES.map(name => name.replace('/', '\\/')).join('|')})(?:\\/.*)?$`,
)
const RAW_IMPORT_SUFFIX = '?raw'
const RAW_IMPORT_NAMESPACE = 'gum-react-raw'

function parseSize(value: string): number {
  const size = Number(value)
  if (!Number.isFinite(size) || size < 0) throw new Error(`invalid size: ${value}`)
  return size
}

function parseTheme(value: string): ThemeName {
  if (value === 'light' || value === 'dark') return value
  throw new Error(`invalid theme: ${value}`)
}

function findPackageRoot(name: string): string | null {
  let directory = import.meta.dir
  while (true) {
    const candidate = join(directory, 'node_modules', name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

function providedPackageRoot(name: string): string | null {
  return name === '@gum-jsx/react' ? resolve(import.meta.dir, '..') : findPackageRoot(name)
}

function linkProvidedPackages(outdir: string): void {
  for (const name of PROVIDED_PACKAGES) {
    const root = providedPackageRoot(name)
    if (root == null) continue
    const link = join(outdir, 'node_modules', name)
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(root, link, 'dir')
  }
}

const providedModulesPlugin: BunPlugin = {
  name: 'gum-react-provided-modules',
  setup(build) {
    build.onResolve({ filter: PROVIDED_FILTER }, args => ({ path: args.path, external: true }))
  },
}

function resolveRawImport(path: string, importer: string, resolveDir: string, cwd?: string): string {
  const source = path.slice(0, -RAW_IMPORT_SUFFIX.length)
  if (isAbsolute(source)) return source
  if (source.startsWith('.')) return resolve(cwd ?? (resolveDir || dirname(importer)), source)
  return Bun.resolveSync(source, importer || import.meta.path)
}

function rawImportsPlugin(cwd?: string): BunPlugin {
  return {
    name: 'gum-react-raw-imports',
    setup(build) {
      build.onResolve({ filter: /\?raw$/ }, args => ({
        path: resolveRawImport(args.path, args.importer, args.resolveDir, cwd),
        namespace: RAW_IMPORT_NAMESPACE,
      }))
      build.onLoad({ filter: /.*/, namespace: RAW_IMPORT_NAMESPACE }, async args => ({
        contents: await Bun.file(args.path).text(),
        loader: 'text',
      }))
    },
  }
}

async function loadComponent(input: string, cwd?: string): Promise<LoadedComponentBundle> {
  const inputPath = resolve(input)
  const outdir = mkdtempSync(join(tmpdir(), 'gum-react-'))
  const cleanup = () => rmSync(outdir, { recursive: true, force: true })
  try {
    linkProvidedPackages(outdir)
    const result = await Bun.build({
      entrypoints: [inputPath],
      outdir,
      publicPath: `${outdir}/`,
      target: 'bun',
      format: 'esm',
      plugins: [rawImportsPlugin(cwd == null ? undefined : resolve(cwd)), providedModulesPlugin],
    })
    if (!result.success) {
      throw new Error(result.logs.map(log => log.message).join('\n') || `failed to bundle ${inputPath}`)
    }
    const entry = result.outputs.find((output: BuildArtifact) => output.kind === 'entry-point')
    if (entry == null) throw new Error(`failed to bundle ${inputPath}`)
    const module = await import(entry.path) as ComponentModule
    if (module.default == null) throw new Error(`${input} has no default export`)
    return { Component: module.default, cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}

async function main() {
  program
    .argument('<component>', 'path to a component .tsx file')
    .option('-s, --size <pixels>', 'maximum SVG dimension', parseSize, 500)
    .option('-t, --theme <theme>', 'color theme (light or dark)', parseTheme, 'light')
    .option('-c, --cwd <dir>', 'base directory for relative ?raw imports')
    .parse()

  const input = program.args[0]
  if (input == null) throw new Error('component path is required')
  const { size, theme, cwd } = program.opts<CliOptions>()
  let cleanup = () => {}
  try {
    const bundle = await loadComponent(input, cwd)
    cleanup = bundle.cleanup
    const root = createGumRoot({ size, theme })
    await root.loadFonts()
    root.render(<bundle.Component theme={theme} />)
    console.log(root.getSvg())
  } finally {
    cleanup()
  }
}

await main()
