import sourceMapSupport from "source-map-support"
sourceMapSupport.install(options)
import path from "path"
import { PerfTimer } from "./util/perf"
import { rm } from "fs/promises"
import { GlobbyFilterFunction, isGitIgnored } from "globby"
import { styleText } from "util"
import { parseMarkdown } from "./processors/parse"
import { filterContent } from "./processors/filter"
import { emitContent } from "./processors/emit"
import cfg from "../quartz.config"
import { FilePath, joinSegments, slugifyFilePath, FullSlug, SimpleSlug } from "./util/path"
import chokidar from "chokidar"
import { ProcessedContent } from "./plugins/vfile"
import { Argv, BuildCtx } from "./util/ctx"
import { glob, toPosixPath } from "./util/glob"
import { trace } from "./util/trace"
import { options } from "./util/sourcemap"
import { Mutex } from "async-mutex"
import { getStaticResourcesFromPlugins } from "./plugins"
import { randomIdNonSecure } from "./util/random"
import { ChangeEvent } from "./plugins/types"
import { minimatch } from "minimatch"
// 改动 1：在文件顶部新增导入
import { stat, writeFile, readFile, mkdir, unlink } from "fs/promises"
import { existsSync } from "fs"
import { defaultProcessedContent } from "./plugins/vfile"

type ContentMap = Map<
  FilePath,
  | {
      type: "markdown"
      content: ProcessedContent
    }
  | {
      type: "other"
    }
>

type BuildData = {
  ctx: BuildCtx
  ignored: GlobbyFilterFunction
  mut: Mutex
  contentMap: ContentMap
  changesSinceLastBuild: Record<FilePath, ChangeEvent["type"]>
  lastBuildMs: number
}

// 改动 2：在 BuildData 类型后新增缓存相关类型和函数
type GraphNode = {
  slug: string
  title: string
  tags: string[]
}

type GraphEdge = {
  source: string // slug
  target: string // slug
}

type GraphCache = {
  nodes: Record<string, GraphNode> // key 是 slug
  edges: GraphEdge[]
}

// 缓存清单类型
type CacheManifest = {
  version: string
  files: {
    [key: string]: {
      mtime: number
      // slug?: string
      // links?: string[]
      metadata?: {
        slug: string
        title?: string
        links: string[]
        tags?: string[]
        frontmatter?: Record<string, any>
        description?: string
        relativePath?: string
      }
    }
  }
  graph: GraphCache // 新增图谱缓存
}

// 加载缓存
async function loadCacheManifest(output: string): Promise<CacheManifest> {
  const cacheFile = path.join(output, ".quartz-cache.json")
  try {
    if (existsSync(cacheFile)) {
      const data = await readFile(cacheFile, "utf-8")
      const parsed = JSON.parse(data)
      // 确保有 graph 字段
      if (!parsed.graph) {
        parsed.graph = { nodes: {}, edges: [] }
      }
      return JSON.parse(data)
    }
  } catch (err) {
    console.log("Failed to load cache, will do full build")
  }
  return { version: "1.0", files: {}, graph: { nodes: {}, edges: [] } }
}

// 保存缓存
async function saveCacheManifest(output: string, manifest: CacheManifest): Promise<void> {
  const cacheFile = path.join(output, ".quartz-cache.json")
  await writeFile(cacheFile, JSON.stringify(manifest, null, 2))
}

// 检测变化的文件
async function detectChangedFiles(
  allFiles: string[],
  cache: CacheManifest,
  directory: string,
): Promise<{ changed: string[]; deleted: FilePath[] }> {
  // 返回两个列表
  const changed: FilePath[] = []
  const deleted: FilePath[] = []

  // 构建当前文件的 Set，方便查找
  const currentFilesSet = new Set<string>()

  // 检测新增和修改
  for (const fp of allFiles) {
    if (!fp.endsWith(".md")) continue

    const fullPath = joinSegments(directory, fp) as FilePath
    currentFilesSet.add(fullPath)

    try {
      const stats = await stat(fullPath)
      const cached = cache.files[fullPath]

      if (!cached || cached.mtime !== stats.mtimeMs) {
        changed.push(fullPath)
      }
    } catch {
      changed.push(fullPath)
    }
  }

  // 检测删除：缓存中有但当前不存在的
  for (const cachedPath of Object.keys(cache.files)) {
    if (!currentFilesSet.has(cachedPath)) {
      deleted.push(cachedPath as FilePath)
    }
  }

  return { changed, deleted }
}
// 改动2结束

// 新增图谱更新函数
function updateGraphCache(
  graphCache: GraphCache,
  changedFiles: ProcessedContent[],
  deletedFiles: FilePath[],
  cacheManifest: CacheManifest,
) {
  // 处理删除的文件
  for (const filePath of deletedFiles) {
    const cached = cacheManifest.files[filePath]
    const slug = cached?.metadata?.slug
    if (!slug) continue

    // 删除节点
    delete graphCache.nodes[slug]

    // 删除所有从这个节点出发的边（outgoing edges）
    graphCache.edges = graphCache.edges.filter((edge) => edge.source !== slug)

    // 注意：不删除指向这个节点的边（incoming edges）
    // 因为其他文件仍然链接到它，需要生成虚拟节点
  }

  // 处理变化的文件
  for (const [_tree, file] of changedFiles) {
    const slug = file.data.slug!

    // 更新节点
    graphCache.nodes[slug] = {
      slug: slug,
      title: (file.data.title as string) || slug,
      tags: Array.isArray(file.data.tags) ? file.data.tags : [],
    }

    // 删除这个文件的旧边（outgoing edges）
    graphCache.edges = graphCache.edges.filter((edge) => edge.source !== slug)

    // 添加新边
    const links = file.data.links || []
    for (const target of links) {
      graphCache.edges.push({
        source: slug,
        target: target,
      })

      // 如果目标节点不存在，创建虚拟节点
      if (!graphCache.nodes[target]) {
        graphCache.nodes[target] = {
          slug: target,
          title: target,
          tags: [],
        }
      }
    }
  }

  console.log(
    `Graph updated: ${Object.keys(graphCache.nodes).length} nodes, ${graphCache.edges.length} edges`,
  )
}

async function buildQuartz(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  const ctx: BuildCtx = {
    buildId: randomIdNonSecure(),
    argv,
    cfg,
    allSlugs: [],
    allFiles: [],
    incremental: false,
  }

  const perf = new PerfTimer()
  const output = argv.output

  const pluginCount = Object.values(cfg.plugins).flat().length
  const pluginNames = (key: "transformers" | "filters" | "emitters") =>
    cfg.plugins[key].map((plugin) => plugin.name)
  if (argv.verbose) {
    console.log(`Loaded ${pluginCount} plugins`)
    console.log(`  Transformers: ${pluginNames("transformers").join(", ")}`)
    console.log(`  Filters: ${pluginNames("filters").join(", ")}`)
    console.log(`  Emitters: ${pluginNames("emitters").join(", ")}`)
  }

  // API 模式下，调用者（handlers.js）已经持有锁，不需要再次获取
  // const release = await mut.acquire()
  perf.addEvent("clean")
  await rm(output, { recursive: true, force: true })
  console.log(`Cleaned output directory \`${output}\` in ${perf.timeSince("clean")}`)

  perf.addEvent("glob")
  const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns)
  const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
  console.log(
    `Found ${markdownPaths.length} input files from \`${argv.directory}\` in ${perf.timeSince("glob")}`,
  )

  const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
  ctx.allFiles = allFiles
  ctx.allSlugs = allFiles.map((fp) => slugifyFilePath(fp as FilePath))

  const parsedFiles = await parseMarkdown(ctx, filePaths)
  const filteredContent = filterContent(ctx, parsedFiles)

  await emitContent(ctx, filteredContent)
  console.log(
    styleText("green", `Done processing ${markdownPaths.length} files in ${perf.timeSince()}`),
  )
  // release()  // API 模式下由调用者释放锁

  if (argv.watch) {
    ctx.incremental = true
    return startWatching(ctx, mut, parsedFiles, clientRefresh)
  } else if (argv.api) {
    return startApi(ctx, mut, parsedFiles, clientRefresh)
  }
}

// 改动 3：新增增量构建函数
// 增量构建函数
async function buildQuartzIncremental(argv: Argv, mut: Mutex, clientRefresh: () => void) {
  console.log("[DEBUG] buildQuartzIncremental started")
  const ctx: BuildCtx = {
    buildId: randomIdNonSecure(),
    argv,
    cfg,
    allSlugs: [],
    allFiles: [],
    graphCache: {
      nodes: {},
      edges: [],
    },
    incremental: true, // 开启增量模式
  }

  console.log("[DEBUG] ctx initialized")

  const perf = new PerfTimer()
  const output = argv.output
  console.log(`[DEBUG] output directory: ${output}`)

  if (argv.verbose) {
    const pluginCount = Object.values(cfg.plugins).flat().length
    console.log(`Loaded ${pluginCount} plugins`)
  }

  // const release = await mut.acquire()
  // console.log("[DEBUG] mutex acquired")

  // 加载缓存
  perf.addEvent("load-cache")
  const cacheManifest = await loadCacheManifest(output)
  console.log(`Loaded cache in ${perf.timeSince("load-cache")}`)

  // 确保输出目录存在（不删除）
  await mkdir(output, { recursive: true })

  // 获取所有文件
  perf.addEvent("glob")
  const allFiles = await glob("**/*.*", argv.directory, cfg.configuration.ignorePatterns)
  const markdownPaths = allFiles.filter((fp) => fp.endsWith(".md")).sort()
  console.log(`Found ${markdownPaths.length} input files in ${perf.timeSince("glob")}`)

  // 检测变化的文件
  perf.addEvent("detect-changes")
  const { changed: changedFilePaths, deleted: deletedFilePaths } = await detectChangedFiles(
    markdownPaths,
    cacheManifest,
    argv.directory,
  )
  console.log(`Detected ${changedFilePaths.length} changed, ${deletedFilePaths.length} deleted`)

  // 设置上下文
  // const filePaths = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
  ctx.allFiles = allFiles
  ctx.allSlugs = allFiles.map((fp) => slugifyFilePath(fp as FilePath))
  ctx.graphCache = cacheManifest.graph

  // 如果没有任何变化，跳过构建
  if (changedFilePaths.length === 0 && deletedFilePaths.length === 0) {
    console.log(styleText("green", "No changes detected, skipping build"))
    // release()
    return
  }

  // 只解析变化的文件
  perf.addEvent("parse")
  const parsedFiles = await parseMarkdown(ctx, changedFilePaths as FilePath[])
  console.log(`Parsed ${parsedFiles.length} files in ${perf.timeSince("parse")}`)
  // ===== 新增：从缓存恢复未变化的文件 =====
  perf.addEvent("restore-cache")
  const allParsedFiles: ProcessedContent[] = [...parsedFiles]

  // 获取所有当前存在的文件路径
  const allCurrentFiles = markdownPaths.map((fp) => joinSegments(argv.directory, fp) as FilePath)
  const changedSet = new Set(changedFilePaths)
  const deletedSet = new Set(deletedFilePaths)

  let restoredCount = 0
  for (const filepath of allCurrentFiles) {
    // 如果文件没变化且没被删除，从缓存恢复
    if (!changedSet.has(filepath) && !deletedSet.has(filepath)) {
      const cached = cacheManifest.files[filepath]
      if (cached?.metadata) {
        // 用缓存的元数据重建 ProcessedContent
        const restoredContent = defaultProcessedContent({
          slug: cached.metadata.slug as FullSlug,
          relativePath: cached.metadata.relativePath as FilePath,
          filePath: cached.metadata.relativePath as FilePath, // 添加这行
          links: cached.metadata.links as SimpleSlug[],
          tags: cached.metadata.tags,
          frontmatter: {
            title: cached.metadata.title || cached.metadata.slug,
            ...(cached.metadata.frontmatter || {}),
          },
          title: cached.metadata.title,
          description: cached.metadata.description,
        })
        allParsedFiles.push(restoredContent)
        restoredCount++
      }
    }
  }

  console.log(`Restored ${restoredCount} files from cache in ${perf.timeSince("restore-cache")}`)
  console.log(`Total files for processing: ${allParsedFiles.length}`)

  // 更新图谱缓存
  perf.addEvent("update-graph")
  updateGraphCache(cacheManifest.graph, parsedFiles, deletedFilePaths, cacheManifest)
  console.log(`Updated graph cache in ${perf.timeSince("update-graph")}`)

  // ===== 结束新增 =====
  // 构造 changeEvents，包括删除事件
  const changeEvents: ChangeEvent[] = [
    // 新增和修改
    ...parsedFiles.map(
      ([_tree, file]): ChangeEvent => ({
        type: "change" as const,
        path: file.data.relativePath!,
        file: file,
      }),
    ),
    // 删除 - 从缓存恢复元数据用于生成虚拟节点
    ...deletedFilePaths.map((fp): ChangeEvent => {
      const cached = cacheManifest.files[fp]

      if (cached?.metadata) {
        const virtualFile = defaultProcessedContent({
          slug: cached.metadata.slug as FullSlug,
          relativePath: cached.metadata.relativePath as FilePath,
          filePath: cached.metadata.relativePath as FilePath,
          links: cached.metadata.links as SimpleSlug[],
          tags: cached.metadata.tags,
          title: cached.metadata.title || cached.metadata.slug,
          description: cached.metadata.description,
          frontmatter: {
            title: cached.metadata.title || cached.metadata.slug,
            ...(cached.metadata.frontmatter || {}),
          },
        })

        return {
          type: "delete" as const,
          path: path.relative(argv.directory, fp) as FilePath,
          file: virtualFile[1],
        }
      }

      return {
        type: "delete" as const,
        path: path.relative(argv.directory, fp) as FilePath,
        file: undefined, // 显式设置为 undefined
      }
    }),
  ]
  console.log(`Change events: ${changeEvents.length} total`)

  const filteredContent = filterContent(ctx, allParsedFiles)

  // 使用增量 emit（复制自 rebuild 函数）
  perf.addEvent("emit")
  let emittedFiles = 0
  const staticResources = getStaticResourcesFromPlugins(ctx)

  for (const emitter of cfg.plugins.emitters) {
    try {
      const emitFn = emitter.partialEmit ?? emitter.emit
      const emitted = await emitFn(ctx, filteredContent, staticResources, changeEvents)

      if (emitted === null) continue

      if (Symbol.asyncIterator in emitted) {
        for await (const file of emitted) {
          emittedFiles++
          if (argv.verbose) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      } else {
        emittedFiles += emitted.length
        if (argv.verbose) {
          for (const file of emitted) {
            console.log(`[emit:${emitter.name}] ${file}`)
          }
        }
      }
    } catch (err) {
      trace(`Failed to emit from plugin \`${emitter.name}\``, err as Error)
    }
  }

  console.log(`Emitted ${emittedFiles} files in ${perf.timeSince("emit")}`)

  // 更新缓存清单
  for (const [_tree, file] of parsedFiles) {
    const fp = joinSegments(argv.directory, file.data.relativePath!) as FilePath
    try {
      const stats = await stat(fp)
      cacheManifest.files[fp] = {
        mtime: stats.mtimeMs,
        // slug: file.data.slug,
        // links: file.data.links || [],
        metadata: {
          slug: file.data.slug!,
          title: file.data.title as string,
          links: file.data.links || [],
          tags: Array.isArray(file.data.tags) ? file.data.tags : [],
          frontmatter: file.data.frontmatter || {},
          description: file.data.description,
          relativePath: file.data.relativePath,
        },
      }
    } catch (err) {
      console.error(`Failed to cache ${fp}:`, err)
    }
  }

  // 从缓存中移除删除的文件
  for (const deletedPath of deletedFilePaths) {
    delete cacheManifest.files[deletedPath]
  }

  // 删除对应的输出文件
  for (const deletedPath of deletedFilePaths) {
    try {
      const relativePath = path.relative(argv.directory, deletedPath)
      const slug = slugifyFilePath(relativePath as FilePath)
      const outputPath = path.join(output, slug + ".html")
      await unlink(outputPath)
      console.log(`Deleted output: ${outputPath}`)
    } catch (err) {
      // 文件可能已经不存在，忽略错误
    }
  }

  // 保存缓存
  await saveCacheManifest(output, cacheManifest)
  await emitContent(ctx, filteredContent)
  console.log(styleText("green", `Done incremental build in ${perf.timeSince()}`))
  // release()

  if (argv.watch) {
    return startWatching(ctx, mut, parsedFiles, clientRefresh)
  }
}
// 改动3结束

async function startWatching(
  ctx: BuildCtx,
  mut: Mutex,
  initialContent: ProcessedContent[],
  clientRefresh: () => void,
) {
  const { argv, allFiles } = ctx

  const contentMap: ContentMap = new Map()
  for (const filePath of allFiles) {
    contentMap.set(filePath, {
      type: "other",
    })
  }

  for (const content of initialContent) {
    const [_tree, vfile] = content
    contentMap.set(vfile.data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  const gitIgnoredMatcher = await isGitIgnored()
  const buildData: BuildData = {
    ctx,
    mut,
    contentMap,
    ignored: (fp) => {
      const pathStr = toPosixPath(fp.toString())
      if (pathStr.startsWith(".git/")) return true
      if (gitIgnoredMatcher(pathStr)) return true
      for (const pattern of cfg.configuration.ignorePatterns) {
        if (minimatch(pathStr, pattern)) {
          return true
        }
      }

      return false
    },

    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }

  const watcher = chokidar.watch(".", {
    persistent: true,
    cwd: argv.directory,
    ignoreInitial: true,
  })

  const changes: ChangeEvent[] = []
  watcher
    .on("add", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "add" })
      void rebuild(changes, clientRefresh, buildData)
    })
    .on("change", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "change" })
      void rebuild(changes, clientRefresh, buildData)
    })
    .on("unlink", (fp) => {
      fp = toPosixPath(fp)
      if (buildData.ignored(fp)) return
      changes.push({ path: fp as FilePath, type: "delete" })
      void rebuild(changes, clientRefresh, buildData)
    })

  return async () => {
    await watcher.close()
  }
}

// setup api-endpoints for rebuilds
async function startApi(
  ctx: BuildCtx,
  mut: Mutex,
  initialContent: ProcessedContent[],
  clientRefresh: () => void,
) {
  const { argv, allFiles } = ctx

  const contentMap: ContentMap = new Map()
  for (const filePath of allFiles) {
    contentMap.set(filePath, {
      type: "other",
    })
  }

  for (const content of initialContent) {
    const [_tree, vfile] = content
    contentMap.set(vfile.data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  const gitIgnoredMatcher = await isGitIgnored()
  const buildData: BuildData = {
    ctx,
    mut,
    contentMap,
    ignored: (fp) => {
      const pathStr = toPosixPath(fp.toString())
      if (pathStr.startsWith(".git/")) return true
      if (gitIgnoredMatcher(pathStr)) return true
      for (const pattern of cfg.configuration.ignorePatterns) {
        if (minimatch(pathStr, pattern)) {
          return true
        }
      }

      return false
    },

    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }

  // 返回一个API接口，允许外部调用构建功能
  return {
    // 手动触发完整构建
    async fullBuild() {
      await buildQuartz(argv, mut, clientRefresh)
    },

    // 手动触发增量构建
    async incrementalBuild(changes: ChangeEvent[]) {
      await rebuild(changes, clientRefresh, buildData)
    },

    // 关闭构建进程
    async close() {
      // 如果有watcher，关闭它
      return Promise.resolve()
    },
  }
}

async function rebuild(changes: ChangeEvent[], clientRefresh: () => void, buildData: BuildData) {
  const { ctx, contentMap, mut, changesSinceLastBuild } = buildData
  const { argv, cfg } = ctx

  const buildId = randomIdNonSecure()
  ctx.buildId = buildId
  buildData.lastBuildMs = new Date().getTime()
  const numChangesInBuild = changes.length
  const release = await mut.acquire()

  // if there's another build after us, release and let them do it
  if (ctx.buildId !== buildId) {
    release()
    return
  }

  const perf = new PerfTimer()
  perf.addEvent("rebuild")
  console.log(styleText("yellow", "Detected change, rebuilding..."))

  // update changesSinceLastBuild
  for (const change of changes) {
    changesSinceLastBuild[change.path] = change.type
  }

  const staticResources = getStaticResourcesFromPlugins(ctx)
  const pathsToParse: FilePath[] = []
  for (const [fp, type] of Object.entries(changesSinceLastBuild)) {
    if (type === "delete" || path.extname(fp) !== ".md") continue
    const fullPath = joinSegments(argv.directory, toPosixPath(fp)) as FilePath
    pathsToParse.push(fullPath)
  }

  const parsed = await parseMarkdown(ctx, pathsToParse)
  for (const content of parsed) {
    contentMap.set(content[1].data.relativePath!, {
      type: "markdown",
      content,
    })
  }

  // update state using changesSinceLastBuild
  // we do this weird play of add => compute change events => remove
  // so that partialEmitters can do appropriate cleanup based on the content of deleted files
  for (const [file, change] of Object.entries(changesSinceLastBuild)) {
    if (change === "delete") {
      // universal delete case
      contentMap.delete(file as FilePath)
    }

    // manually track non-markdown files as processed files only
    // contains markdown files
    if (change === "add" && path.extname(file) !== ".md") {
      contentMap.set(file as FilePath, {
        type: "other",
      })
    }
  }

  const changeEvents: ChangeEvent[] = Object.entries(changesSinceLastBuild).map(([fp, type]) => {
    const path = fp as FilePath
    const processedContent = contentMap.get(path)
    if (processedContent?.type === "markdown") {
      const [_tree, file] = processedContent.content
      return {
        type,
        path,
        file,
      }
    }

    return {
      type,
      path,
    }
  })

  // update allFiles and then allSlugs with the consistent view of content map
  ctx.allFiles = Array.from(contentMap.keys())
  ctx.allSlugs = ctx.allFiles.map((fp) => slugifyFilePath(fp as FilePath))
  let processedFiles = filterContent(
    ctx,
    Array.from(contentMap.values())
      .filter((file) => file.type === "markdown")
      .map((file) => file.content),
  )

  let emittedFiles = 0
  for (const emitter of cfg.plugins.emitters) {
    // Try to use partialEmit if available, otherwise assume the output is static
    const emitFn = emitter.partialEmit ?? emitter.emit
    const emitted = await emitFn(ctx, processedFiles, staticResources, changeEvents)
    if (emitted === null) {
      continue
    }

    if (Symbol.asyncIterator in emitted) {
      // Async generator case
      for await (const file of emitted) {
        emittedFiles++
        if (ctx.argv.verbose) {
          console.log(`[emit:${emitter.name}] ${file}`)
        }
      }
    } else {
      // Array case
      emittedFiles += emitted.length
      if (ctx.argv.verbose) {
        for (const file of emitted) {
          console.log(`[emit:${emitter.name}] ${file}`)
        }
      }
    }
  }

  console.log(`Emitted ${emittedFiles} files to \`${argv.output}\` in ${perf.timeSince("rebuild")}`)
  console.log(styleText("green", `Done rebuilding in ${perf.timeSince()}`))
  changes.splice(0, numChangesInBuild)
  clientRefresh()
  release()
}

export default async (argv: Argv, mut: Mutex, clientRefresh: () => void) => {
  try {
    // 改动 4：修改 export default
    // 如果启用增量构建（通过新的命令行参数判断）
    if (argv.incremental) {
      return await buildQuartzIncremental(argv, mut, clientRefresh)
    }
    // 改动4结束
    return await buildQuartz(argv, mut, clientRefresh)
  } catch (err) {
    // API 模式下，直接抛出错误，不再重复处理
    if (globalThis.__QUARTZ_API_MODE__) {
      throw err
    }
    trace("\nExiting Quartz due to a fatal error", err as Error)
  }
}
