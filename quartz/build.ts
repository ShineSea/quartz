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

// ==================== 图谱中心的增量构建架构 ====================
// 核心思想：所有内容抽象为图谱节点和边，通过图谱差异计算实现增量构建

// 节点类型枚举
type NodeType = "entity" | "virtual" | "tag"

// 图谱节点（统一所有类型的节点）
type GraphNode = {
  slug: string           // 节点唯一标识
  type: NodeType         // 节点类型
  title: string          // 显示标题
  tags: string[]         // 关联的标签
  
  // 仅实体节点（来自 MD 文件）有以下字段
  filePath?: string      // 源文件路径（用于 mtime 检测）
  mtime?: number         // 文件修改时间
  description?: string   // 描述
  frontmatter?: Record<string, any>  // 前置元数据
}

// 边类型枚举
type EdgeType = "link" | "tag" | "backlink"

// 图谱边（关系）
type GraphEdge = {
  source: string  // 源节点 slug
  target: string  // 目标节点 slug
  type: EdgeType  // 边的类型
}

// 图谱缓存（核心数据结构）
type GraphCache = {
  nodes: Record<string, GraphNode>  // key 是 slug
  edges: GraphEdge[]                // 所有关系
}

// 缓存清单
type CacheManifest = {
  version: string
  graph: GraphCache  // 图谱就是一切！
}

// 影响分析结果：记录哪些节点受到变化影响
type ImpactAnalysis = {
  directChanges: Set<string>      // 直接变化的节点（文件增删改）
  affectedByLinks: Set<string>    // 因为链接关系受影响的节点
  affectedByTags: Set<string>     // 因为标签关系受影响的节点
  affectedByBacklinks: Set<string> // 因为反向链接受影响的节点
  allAffected: Set<string>        // 所有受影响的节点（union）
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
      return parsed
    }
  } catch (err) {
    console.log("Failed to load cache, will do full build")
  }
  return { version: "1.0", graph: { nodes: {}, edges: [] } }
}

// 保存缓存
async function saveCacheManifest(output: string, manifest: CacheManifest): Promise<void> {
  const cacheFile = path.join(output, ".quartz-cache.json")
  await writeFile(cacheFile, JSON.stringify(manifest, null, 2))
}

// 检测变化的文件（基于图谱节点）
async function detectChangedFiles(
  allFiles: string[],
  cache: CacheManifest,
  directory: string,
): Promise<{ changed: string[]; deleted: FilePath[] }> {
  const changed: FilePath[] = []
  const deleted: FilePath[] = []

  // 构建当前文件的 Set
  const currentFilesSet = new Set<string>()
  const pathToSlugMap = new Map<string, string>()  // 文件路径 -> slug 映射

  // 检测新增和修改
  for (const fp of allFiles) {
    if (!fp.endsWith(".md")) continue

    const fullPath = joinSegments(directory, fp) as FilePath
    const slug = slugifyFilePath(fp as FilePath)
    currentFilesSet.add(fullPath)
    pathToSlugMap.set(fullPath, slug)

    try {
      const stats = await stat(fullPath)
      const cachedNode = cache.graph.nodes[slug]

      // 通过 mtime 判断是否变化
      if (!cachedNode || cachedNode.mtime !== stats.mtimeMs) {
        changed.push(fullPath)
      }
    } catch {
      changed.push(fullPath)
    }
  }

  // 检测删除：缓存中的 entity 节点但当前不存在的
  for (const [slug, node] of Object.entries(cache.graph.nodes)) {
    if (node.type === "entity" && node.filePath) {
      if (!currentFilesSet.has(node.filePath)) {
        deleted.push(node.filePath as FilePath)
      }
    }
  }

  return { changed, deleted }
}
// 改动2结束

// 更新图谱缓存（核心逻辑）
function updateGraphCache(
  graphCache: GraphCache,
  changedFiles: ProcessedContent[],
  deletedFiles: FilePath[],
) {
  // ==== 1. 处理删除的文件 ====
  for (const filePath of deletedFiles) {
    // 通过 filePath 找到对应的 slug
    const deletedNode = Object.values(graphCache.nodes).find(n => n.filePath === filePath)
    if (!deletedNode) continue
    
    const slug = deletedNode.slug

    // 删除该节点（如果是 entity 节点）
    if (deletedNode.type === "entity") {
      delete graphCache.nodes[slug]
    }

    // 删除所有从这个节点出去的边
    graphCache.edges = graphCache.edges.filter((edge) => edge.source !== slug)

    // 注意：不删除指向这个节点的边（incoming edges）
    // 因为其他文件仍然链接到它，需要生成虚拟节点
    // 将节点类型改为 virtual（如果有其他节点链接到它）
    const hasIncomingEdges = graphCache.edges.some(edge => edge.target === slug)
    if (hasIncomingEdges) {
      graphCache.nodes[slug] = {
        slug,
        type: "virtual",
        title: slug,  // 虚拟节点使用 slug 作为标题
        tags: [],
      }
    }
  }

  // ==== 2. 处理变化/新增的文件 ====
  for (const [_tree, file] of changedFiles) {
    const slug = file.data.slug!
    const links = file.data.links || []
    const tags = Array.isArray(file.data.tags) ? file.data.tags : []

    // 检查是否是从 virtual 转换为 entity
    const existingNode = graphCache.nodes[slug]
    const isVirtualToEntity = existingNode && existingNode.type === "virtual"
    
    if (isVirtualToEntity) {
      console.log(`Converting virtual node to entity: ${slug}`)
      // 虚拟节点转为实体节点
      // 保留 incoming edges（它们已经在 edges 中，无需特殊处理）
    }

    // 更新/创建 entity 节点
    graphCache.nodes[slug] = {
      slug,
      type: "entity",
      title: (file.data.title as string) || slug,
      tags,
      filePath: file.data.relativePath!,
      mtime: 0,  // 先设为 0，后续由保存缓存时更新
      description: file.data.description,
      frontmatter: file.data.frontmatter || {},
    }

    // 删除这个节点的旧边（outgoing edges）
    // 注意：incoming edges 会被保留，因为只删除 source === slug 的边
    graphCache.edges = graphCache.edges.filter(
      (edge) => edge.source !== slug || edge.type !== "link"
    )

    // 添加新的链接边
    for (const target of links) {
      graphCache.edges.push({
        source: slug,
        target: target,
        type: "link",
      })

      // 如果目标节点不存在，创建虚拟节点
      if (!graphCache.nodes[target]) {
        graphCache.nodes[target] = {
          slug: target,
          type: "virtual",
          title: target,
          tags: [],
        }
      } else if (graphCache.nodes[target].type === "entity") {
        // 目标节点已经是实体节点，无需操作
      } else if (graphCache.nodes[target].type === "virtual") {
        // 目标节点仍然是虚拟节点，保持不变
      }
    }

    // 处理 tag 边（删除旧的 tag 边，添加新的）
    graphCache.edges = graphCache.edges.filter(
      (edge) => edge.source !== slug || edge.type !== "tag"
    )
    
    for (const tag of tags) {
      const tagSlug = `tags/${tag}`
      
      // 确保 tag 节点存在
      if (!graphCache.nodes[tagSlug]) {
        graphCache.nodes[tagSlug] = {
          slug: tagSlug,
          type: "tag",
          title: tag,
          tags: [],
        }
      }
      
      // 添加 tag 边
      graphCache.edges.push({
        source: slug,
        target: tagSlug,
        type: "tag",
      })
    }
  }

  console.log(
    `Graph updated: ${Object.keys(graphCache.nodes).length} nodes ` +
    `(${Object.values(graphCache.nodes).filter(n => n.type === "entity").length} entity, ` +
    `${Object.values(graphCache.nodes).filter(n => n.type === "virtual").length} virtual, ` +
    `${Object.values(graphCache.nodes).filter(n => n.type === "tag").length} tag), ` +
    `${graphCache.edges.length} edges`
  )
}

// ==================== 增量构建的核心：影响分析 ====================
// 分析哪些节点受到变化影响，需要重新生成
function analyzeImpact(
  graph: GraphCache,
  changedSlugs: Set<string>,
  deletedSlugs: Set<string>,
): ImpactAnalysis {
  const directChanges = new Set<string>([...changedSlugs, ...deletedSlugs])
  const affectedByLinks = new Set<string>()
  const affectedByTags = new Set<string>()
  const affectedByBacklinks = new Set<string>()

  // ==== 1. 分析链接影响 ====
  // 如果 A -> B，B 变化了，A 需要更新（因为 A 显示到 B 的链接）
  for (const slug of directChanges) {
    for (const edge of graph.edges) {
      if (edge.type === "link") {
        // 如果有链接指向变化的节点
        if (edge.target === slug) {
          affectedByLinks.add(edge.source)
        }
        // 如果变化的节点链接到其他节点
        if (edge.source === slug) {
          affectedByLinks.add(edge.target)
        }
      }
    }
  }

  // ==== 2. 分析标签影响 ====
  // 如果一个文件的标签变了，该标签页需要更新
  for (const slug of changedSlugs) {
    const node = graph.nodes[slug]
    if (node && node.type === "entity") {
      for (const tag of node.tags) {
        const tagSlug = `tags/${tag}`
        affectedByTags.add(tagSlug)
      }
    }
  }
  
  // 删除的文件也要更新其相关的标签页
  for (const slug of deletedSlugs) {
    // 查找该节点的所有 tag 边
    for (const edge of graph.edges) {
      if (edge.source === slug && edge.type === "tag") {
        affectedByTags.add(edge.target)
      }
    }
  }

  // ==== 3. 分析反向链接影响 ====
  // 如果 A -> B，A 变化了，B 的反向链接列表需要更新
  for (const slug of directChanges) {
    for (const edge of graph.edges) {
      if (edge.type === "link" && edge.source === slug) {
        affectedByBacklinks.add(edge.target)
      }
      if (edge.type === "link" && edge.target === slug) {
        affectedByBacklinks.add(edge.source)
      }
    }
  }

  // ==== 4. 汇总所有受影响的节点 ====
  const allAffected = new Set<string>([
    ...directChanges,
    ...affectedByLinks,
    ...affectedByTags,
    ...affectedByBacklinks,
  ])

  console.log(
    `Impact Analysis: ` +
    `${directChanges.size} direct changes, ` +
    `${affectedByLinks.size} affected by links, ` +
    `${affectedByTags.size} affected by tags, ` +
    `${affectedByBacklinks.size} affected by backlinks, ` +
    `Total: ${allAffected.size} nodes need rebuild`
  )

  return {
    directChanges,
    affectedByLinks,
    affectedByTags,
    affectedByBacklinks,
    allAffected,
  }
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
  // ===== 从缓存恢复未变化的文件 =====
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
      const relativePath = path.relative(argv.directory, filepath) as FilePath
      const slug = slugifyFilePath(relativePath as FilePath)
      const cachedNode = cacheManifest.graph.nodes[slug]
      
      if (cachedNode && cachedNode.type === "entity") {
        // 用缓存的节点数据重建 ProcessedContent
        const restoredContent = defaultProcessedContent({
          slug: slug as FullSlug,
          relativePath: relativePath,
          filePath: relativePath,
          links: [], // links 从 edges 中恢复
          tags: cachedNode.tags,
          frontmatter: {
            title: cachedNode.title || slug,
            ...(cachedNode.frontmatter || {}),
          },
          title: cachedNode.title,
          description: cachedNode.description,
        })
        
        // 从边中恢复 links
        const links = cacheManifest.graph.edges
          .filter(edge => edge.source === slug && edge.type === "link")
          .map(edge => edge.target as SimpleSlug)
        restoredContent[1].data.links = links
        
        allParsedFiles.push(restoredContent)
        restoredCount++
      }
    }
  }

  console.log(`Restored ${restoredCount} files from cache in ${perf.timeSince("restore-cache")}`)
  console.log(`Total files for processing: ${allParsedFiles.length}`)

  // 更新图谱缓存
  perf.addEvent("update-graph")
  updateGraphCache(cacheManifest.graph, parsedFiles, deletedFilePaths)
  console.log(`Updated graph cache in ${perf.timeSince("update-graph")}`)

  // ==================== 核心改进：基于图谱的影响分析 ====================
  // 计算哪些节点受到变化影响
  perf.addEvent("impact-analysis")
  const changedSlugs = new Set(parsedFiles.map(([_, file]) => file.data.slug!))
  const deletedSlugs = new Set(
    deletedFilePaths.map(fp => {
      const relativePath = path.relative(argv.directory, fp) as FilePath
      return slugifyFilePath(relativePath)
    })
  )
  
  const impact = analyzeImpact(cacheManifest.graph, changedSlugs, deletedSlugs)
  console.log(`Impact analysis completed in ${perf.timeSince("impact-analysis")}`)

  // 构造增强的 changeEvents（包含影响分析结果）
  const changeEvents: ChangeEvent[] = [
    // 新增和修改
    ...parsedFiles.map(
      ([_tree, file]): ChangeEvent => ({
        type: "change" as const,
        path: file.data.relativePath!,
        file: file,
      }),
    ),
    // 删除 - 从图谱节点恢复元数据
    ...deletedFilePaths.map((fp): ChangeEvent => {
      const relativePath = path.relative(argv.directory, fp) as FilePath
      const slug = slugifyFilePath(relativePath)
      const cachedNode = cacheManifest.graph.nodes[slug]

      if (cachedNode && cachedNode.type === "entity") {
        // 从边中恢复 links
        const links = cacheManifest.graph.edges
          .filter(edge => edge.source === slug && edge.type === "link")
          .map(edge => edge.target as SimpleSlug)
          
        const virtualFile = defaultProcessedContent({
          slug: slug as FullSlug,
          relativePath: relativePath,
          filePath: relativePath,
          links: links,
          tags: cachedNode.tags,
          title: cachedNode.title || slug,
          description: cachedNode.description,
          frontmatter: {
            title: cachedNode.title || slug,
            ...(cachedNode.frontmatter || {}),
          },
        })

        return {
          type: "delete" as const,
          path: relativePath,
          file: virtualFile[1],
        }
      }

      return {
        type: "delete" as const,
        path: relativePath,
        file: undefined,
      }
    }),
  ]
  
  // 为所有受影响的节点生成虚拟 changeEvent
  // 这样 emitter 的 partialEmit 可以知道哪些页面需要重新生成
  for (const slug of impact.allAffected) {
    // 跳过已经在 changeEvents 中的节点
    if (changedSlugs.has(slug) || deletedSlugs.has(slug)) continue
    
    const node = cacheManifest.graph.nodes[slug]
    if (!node) continue
    
    // 为受影响的节点创建 changeEvent
    if (node.type === "entity" && node.filePath) {
      const relativePath = path.relative(argv.directory, node.filePath) as FilePath
      const links = cacheManifest.graph.edges
        .filter(edge => edge.source === slug && edge.type === "link")
        .map(edge => edge.target as SimpleSlug)
      
      const virtualFile = defaultProcessedContent({
        slug: slug as FullSlug,
        relativePath: relativePath,
        filePath: relativePath,
        links: links,
        tags: node.tags,
        title: node.title || slug,
        description: node.description,
        frontmatter: {
          title: node.title || slug,
          ...(node.frontmatter || {}),
        },
      })
      
      changeEvents.push({
        type: "change" as const,
        path: relativePath,
        file: virtualFile[1],
      })
    } else if (node.type === "tag") {
      // 标签节点也需要通知 emitter 更新
      const tagPath = `${slug}.md` as FilePath
      changeEvents.push({
        type: "change" as const,
        path: tagPath,
        file: undefined,  // 标签页由 tagPage emitter 生成，不需要 file
      })
    } else if (node.type === "virtual") {
      // 虚拟节点：为其创建 changeEvent，通知 VirtualNodePage emitter
      const links = cacheManifest.graph.edges
        .filter(edge => edge.source === slug && edge.type === "link")
        .map(edge => edge.target as SimpleSlug)
      
      const virtualFile = defaultProcessedContent({
        slug: slug as FullSlug,
        relativePath: `${slug}.md` as FilePath,
        filePath: `${slug}.md` as FilePath,
        links: links,
        tags: [],
        title: node.title || slug,
        description: undefined,
        frontmatter: {
          title: node.title || slug,
        },
      })
      
      changeEvents.push({
        type: "change" as const,
        path: `${slug}.md` as FilePath,
        file: virtualFile[1],
      })
    }
  }
  
  console.log(`Change events: ${changeEvents.length} total (${changedSlugs.size} changed, ${deletedSlugs.size} deleted, ${impact.allAffected.size - changedSlugs.size - deletedSlugs.size} affected)`)

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

  // 更新缓存清单（更新 entity 节点的 mtime）
  for (const [_tree, file] of parsedFiles) {
    const slug = file.data.slug!
    const fp = joinSegments(argv.directory, file.data.relativePath!) as FilePath
    
    try {
      const stats = await stat(fp)
      // 直接更新图谱节点的 mtime
      if (cacheManifest.graph.nodes[slug]) {
        cacheManifest.graph.nodes[slug].mtime = stats.mtimeMs
      }
    } catch (err) {
      console.error(`Failed to update mtime for ${fp}:`, err)
    }
  }

  // 从缓存中移除删除的文件（已经在 updateGraphCache 中处理）
  // 无需额外操作，因为节点已经被删除或转为 virtual

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
