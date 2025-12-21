/**
 * 样式主题接口
 * 
 * 只包含视觉风格相关的配置（颜色、圆角、阴影、边框等）
 * 字号、间距等基础样式请在源码中直接定义
 */
export interface StyleTheme {
  name: string
  description?: string
  
  // Explorer 目录样式
  explorer: {
    folderFontWeight: string          // 字重（影响视觉层次）
    folderPadding: string             // 内边距（影响可点击区域）
    folderBorderRadius: string        // 圆角
    folderBackgroundHover: string     // 悬停背景色
    itemSpacing: string               // 项目间距（影响布局视觉）
  }
  
  // CustomMeta 元数据样式
  customMeta: {
    // 容器视觉风格
    containerPadding: string          // 容器内边距
    containerMargin: string           // 容器外边距
    containerBackground: string       // 背景色
    containerBorder: string           // 边框样式
    containerBorderRadius: string     // 圆角
    containerShadow: string           // 阴影效果
    
    // 表格视觉细节
    tableBorderRadius: string         // 表格圆角
    tablePadding: string              // 表格内边距
    keyFontWeight: string             // 键的字重
    rowHoverOpacity: string           // 行悬停透明度
    stripedRowOpacity: string         // 斑马纹透明度
  }
}

/**
 * 样式主题预设
 * 
 * 使用方法：
 * 在 quartz.config.ts 中：
 * styles: styleThemes.default
 */
export const styleThemes: Record<string, StyleTheme> = {
  /**
   * 默认样式 - 保持原始 Quartz 样式
   */
  default: {
    name: "默认样式",
    description: "Quartz 原始样式设计",
    explorer: {
      folderFontWeight: "600",
      folderPadding: "0",
      folderBorderRadius: "0",
      folderBackgroundHover: "transparent",
      itemSpacing: "0",
    },
    customMeta: {
      containerPadding: "1rem",
      containerMargin: "1rem 0",
      containerBackground: "var(--lightgray)",
      containerBorder: "none",
      containerBorderRadius: "4px",
      containerShadow: "none",
      
      tableBorderRadius: "0",
      tablePadding: "0",
      keyFontWeight: "bold",
      rowHoverOpacity: "0.1",
      stripedRowOpacity: "0.05",
    },
  },

  /**
   * 卡片样式 - 现代化卡片设计
   */
  card: {
    name: "卡片样式",
    description: "现代化卡片设计，带阴影和圆角",
    explorer: {
      folderFontWeight: "600",
      folderPadding: "0.4rem 0.6rem",
      folderBorderRadius: "6px",
      folderBackgroundHover: "var(--highlight)",
      itemSpacing: "0.3rem",
    },
    customMeta: {
      containerPadding: "1.5rem",
      containerMargin: "1.5rem 0",
      containerBackground: "var(--light)",
      containerBorder: "1px solid var(--lightgray)",
      containerBorderRadius: "12px",
      containerShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
      
      tableBorderRadius: "0",
      tablePadding: "0.5rem 0",
      keyFontWeight: "600",
      rowHoverOpacity: "0.08",
      stripedRowOpacity: "0.03",
    },
  },

  /**
   * 简约样式 - 极简主义设计
   */
  minimal: {
    name: "简约样式",
    description: "极简设计，强调内容本身",
    explorer: {
      folderFontWeight: "500",
      folderPadding: "0.25rem 0",
      folderBorderRadius: "0",
      folderBackgroundHover: "transparent",
      itemSpacing: "0.2rem",
    },
    customMeta: {
      containerPadding: "1.25rem 0",
      containerMargin: "2rem 0",
      containerBackground: "transparent",
      containerBorder: "none",
      containerBorderRadius: "0",
      containerShadow: "none",
      
      tableBorderRadius: "0",
      tablePadding: "0.35rem 0",
      keyFontWeight: "500",
      rowHoverOpacity: "0.05",
      stripedRowOpacity: "0",
    },
  },
}
