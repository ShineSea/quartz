import { QuartzEmitterPlugin } from "../types"
import { FilePath, FullSlug, joinSegments } from "../../util/path"
import { write } from "./helpers"

/**
 * GraphData Emitter
 * 
 * 输出 graph.json 到 public/static/graph.json
 * 供前端知识图谱组件使用
 * 
 * 数据源自 ctx.graphCache（从 .quartz-cache.json 加载）
 * 区别于 .quartz-cache.json：
 * - .quartz-cache.json: 后端缓存，用于增量构建
 * - public/static/graph.json: 前端数据，用于图谱可视化
 */
export const GraphData: QuartzEmitterPlugin = () => {
  return {
    name: "GraphData",
    async emit(ctx, _content, _resources) {
      const emitted: FilePath[] = []
      
      // 如果有图谱缓存，输出 graph.json
      if (ctx.graphCache) {
        // 只输出 entity 节点和 link 边（前端不需要 tag 边）
        const graphData = {
          nodes: Object.values(ctx.graphCache.nodes)
            .filter(node => node.type === "entity")  // 只输出实体节点
            .map(node => ({
              id: node.slug,
              text: node.title,
              tags: node.tags,
            })),
          links: ctx.graphCache.edges
            .filter(edge => edge.type === "link")  // 只输出链接边
            .map(edge => ({
              source: edge.source,
              target: edge.target,
            })),
        }
        
        const fp = await write({
          ctx,
          content: JSON.stringify(graphData),
          slug: joinSegments("static", "graph") as FullSlug,
          ext: ".json",
        })
        
        emitted.push(fp)
        console.log(
          `GraphData: Generated graph.json with ${graphData.nodes.length} nodes, ${graphData.links.length} links`
        )
      }
      
      return emitted
    },
  }
}