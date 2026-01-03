import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { ProcessedContent, QuartzPluginData, defaultProcessedContent } from "../vfile"
import { FullPageLayout } from "../../cfg"
import {
  FullSlug,
  getAllSegmentPrefixes,
  joinSegments,
  pathToRoot,
  simplifySlug,
} from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import VirtualNodeContent from "../../components/pages/VirtualNodeContent"
import { write } from "./helpers"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"

// quartz/plugins/emitters/virtualNodePage.tsx

function computeVirtualNodes(allFiles: QuartzPluginData[]): Set<string> {
  const existingSlugs = new Set(allFiles.map((f) => simplifySlug(f.slug!)))
  const virtualNodes: Set<string> = new Set()

  // 收集所有标签
  const allTags = new Set(
    allFiles.flatMap((data) => data.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes),
  )

  for (const file of allFiles) {
    const links = file.links ?? []
    for (const link of links) {
      // 排除：1. 已存在的页面 2. 标签 3. tags路径下的
      if (!existingSlugs.has(link) && !allTags.has(link) && !link.startsWith("tags/")) {
        virtualNodes.add(link)
      }
    }
  }

  return virtualNodes
}

async function processVirtualNodePage(
  ctx: BuildCtx,
  nodeName: string,
  allFiles: QuartzPluginData[],
  opts: FullPageLayout,
  resources: StaticResources,
) {
  const slug = nodeName as FullSlug
  const file = defaultProcessedContent({
    slug,
    frontmatter: {
      title: nodeName,
      tags: [],
    },
  })

  const [tree, vfile] = file
  const cfg = ctx.cfg.configuration
  const externalResources = pageResources(pathToRoot(slug), resources)
  const componentData: QuartzComponentProps = {
    ctx,
    fileData: vfile.data,
    externalResources,
    cfg,
    children: [],
    tree,
    allFiles,
  }

  const content = renderPage(cfg, slug, componentData, opts, externalResources)
  return write({
    ctx,
    content,
    slug,
    ext: ".html",
  })
}

export const VirtualNodePage: QuartzEmitterPlugin = () => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: VirtualNodeContent(),
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "VirtualNodePage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((c) => c[1].data)
      const virtualNodes = computeVirtualNodes(ctx, allFiles) // 传入 ctx

      for (const nodeName of virtualNodes) {
        yield processVirtualNodePage(ctx, nodeName, allFiles, opts, resources)
      }
    },
  }
}
