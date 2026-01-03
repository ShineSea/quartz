import { QuartzEmitterPlugin } from "../types"
import { FilePath, FullSlug, joinSegments } from "../../util/path"
import { write } from "./helpers"
 
export const GraphData: QuartzEmitterPlugin = () => {
  return {
    name: "GraphData",
    async emit(ctx, _content, _resources) {
      const emitted: FilePath[] = []
      
      // 如果有图谱缓存，输出 graph.json
      if (ctx.graphCache) {
        const graphData = {
          nodes: ctx.graphCache.nodes,
          edges: ctx.graphCache.edges,
        }
        
        const fp = await write({
          ctx,
          content: JSON.stringify(graphData),
          slug: joinSegments("static", "graph") as FullSlug,
          ext: ".json",
        })
        
        emitted.push(fp)
        console.log('GraphData emitter: Generated graph.json from cache')
      }
      
      return emitted
    },
  }
}