import 'source-map-support/register'
import { resolve } from 'path'
import resolveFrom from 'resolve-from'
import { Route } from '@ream/common/dist/route'
import { pathToRoute } from './utils/path-to-routes'
import { sortRoutesByScore } from './utils/rank-routes'
import { loadConfig } from './utils/load-config'
import { loadPlugins } from './load-plugins'
import { normalizePluginsArray } from './utils/normalize-plugins-array'
import { Store, store } from './store'

export type BuildTarget = 'server' | 'static'
export interface Options {
  dir?: string
  dev?: boolean
  cache?: boolean
  server?: {
    port?: number | string
  }
  target?: BuildTarget
}

type ServerOptions = {
  port: number | string
}

export type ReamPluginConfigItem =
  | string
  | [string]
  | [string, { [k: string]: any }]

export type ReamConfig = {
  env?: {
    [k: string]: string | boolean | number
  }
  target?: BuildTarget
  plugins?: Array<ReamPluginConfigItem>
}

export class Ream {
  dir: string
  isDev: boolean
  shouldCache: boolean
  serverOptions: ServerOptions
  /**
   * Routes metadata
   * This property won't be available in a production server and isn't actual routes, use `.routes` instead
   */
  _routes: Route[]
  prepareType?: 'serve' | 'build'
  config: Required<ReamConfig>
  configPath?: string
  store: Store

  constructor(options: Options = {}, configOverride?: ReamConfig) {
    this.dir = resolve(options.dir || '.')
    this.isDev = Boolean(options.dev)
    this.shouldCache = options.cache !== false
    this.serverOptions = {
      port: options.server?.port || '3000',
    }
    this._routes = []
    this.store = store

    const { data: projectConfig, path: configPath } = loadConfig(this.dir)
    this.configPath = configPath
    this.config = {
      env: {
        ...projectConfig?.env,
        ...configOverride?.env,
      },
      target: configOverride?.target || projectConfig?.target || 'server',
      plugins: [
        ...(configOverride?.plugins || []),
        ...(projectConfig?.plugins || []),
      ],
    }
  }

  invalidate() {
    // noop
  }

  resolveRoot(...args: string[]) {
    return resolve(this.dir, ...args)
  }

  resolveDotReam(...args: string[]) {
    return resolve(this.dir, '.ream', ...args)
  }

  resolveApp(...args: string[]) {
    return resolve(__dirname, '../app', ...args)
  }

  get routes(): Route[] {
    // Use pre-generated file in production server
    if (this.prepareType === 'serve' && !this.isDev) {
      return require(this.resolveDotReam('routes.json'))
    }
    const routes: Route[] = [...this._routes]

    const ownPagesDir = this.resolveApp('pages')
    const patterns = [
      {
        require: (route: Route) => route.entryName === 'pages/_error',
        filename: '_error.js',
      },
      {
        require: (route: Route) => route.entryName === 'pages/_app',
        filename: '_app.js',
      },
      {
        require: (route: Route) => route.entryName === 'pages/_document',
        filename: '_document.js',
      },
      {
        require: (route: Route) => route.entryName === 'pages/404',
        filename: '404.js',
      },
    ]
    for (const pattern of patterns) {
      if (!routes.some(pattern.require)) {
        routes.push(pathToRoute(pattern.filename, ownPagesDir, routes.length))
      }
    }
    return sortRoutesByScore(routes)
  }

  get plugins() {
    return normalizePluginsArray(this.config.plugins, this.dir)
  }

  async getEntry(isClient: boolean) {
    if (isClient) {
      return {
        main: [
          ...(this.isDev
            ? [require.resolve('webpack-hot-middleware/client')]
            : []),
          this.resolveApp('client.js'),
        ],
      }
    }
    return this.routes.reduce(
      (result, route) => {
        return {
          ...result,
          [route.entryName]: route.absolutePath,
        }
      },
      {
        'ream-server': 'ream-server',
      }
    )
  }

  async prepare() {
    if (!this.prepareType) {
      throw new Error(`You cannot call .prepare() directly`)
    }

    if (
      this.prepareType === 'build' ||
      (this.prepareType === 'serve' && this.isDev)
    ) {
      await loadPlugins(this)

      const { prepareFiles } = await import('./prepare-files')
      await prepareFiles(this)
    }
  }

  localResolve(name: string) {
    return resolveFrom(this.dir, name)
  }

  async getRequestHandler() {
    this.prepareType = 'serve'
    await this.prepare()
    const { createServer } = await import('./server/create-server')
    const server = createServer(this)
    return server
  }

  async serve() {
    const server = await this.getRequestHandler()
    server.listen(this.serverOptions.port)
    console.log(`> http://localhost:${this.serverOptions.port}`)
  }

  async build() {
    this.prepareType = 'build'
    await this.prepare()
    const res = await import('./build')
    return res.build(this)
  }
}
