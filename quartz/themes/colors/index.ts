import { ColorScheme } from "../../util/theme"

/**
 * 颜色主题接口
 */
export interface ColorTheme {
  name: string
  description?: string
  lightMode: ColorScheme
  darkMode: ColorScheme
}

/**
 * 颜色主题预设
 * 
 * 使用方法：
 * 在 quartz.config.ts 中：
 * colors: colorThemes.default
 */
export const colorThemes: Record<string, ColorTheme> = {
  /**
   * 默认主题 - 原始 Quartz 配色
   */
  default: {
    name: "默认配色",
    description: "Quartz 原始配色方案",
    lightMode: {
      light: "#faf8f8",
      lightgray: "#e5e5e5",
      gray: "#b8b8b8",
      darkgray: "#4e4e4e",
      dark: "#2b2b2b",
      secondary: "#284b63",
      tertiary: "#84a59d",
      highlight: "rgba(143, 159, 169, 0.15)",
      textHighlight: "#fff23688",
    },
    darkMode: {
      light: "#161618",
      lightgray: "#393639",
      gray: "#646464",
      darkgray: "#d4d4d4",
      dark: "#ebebec",
      secondary: "#7b97aa",
      tertiary: "#84a59d",
      highlight: "rgba(143, 159, 169, 0.15)",
      textHighlight: "#b3aa0288",
    },
  },

  /**
   * 深海蓝主题 - 专业、沉稳、适合技术文档
   */
  deepOcean: {
    name: "深海蓝",
    description: "专业沉稳的深蓝配色，适合技术文档和知识库",
    lightMode: {
      light: "#f8fafc",           // 极浅的蓝灰色背景
      lightgray: "#e2e8f0",       // 浅蓝灰
      gray: "#94a3b8",            // 中灰蓝
      darkgray: "#334155",        // 深蓝灰
      dark: "#0f172a",            // 深蓝黑
      secondary: "#0369a1",       // 主蓝色（链接等）
      tertiary: "#0891b2",        // 青色（强调）
      highlight: "rgba(3, 105, 161, 0.1)",
      textHighlight: "#fef3c7aa",
    },
    darkMode: {
      light: "#0f172a",           // 深蓝黑背景
      lightgray: "#1e293b",       // 深蓝灰
      gray: "#475569",            // 中蓝灰
      darkgray: "#cbd5e1",        // 浅蓝灰
      dark: "#f1f5f9",            // 浅色文字
      secondary: "#38bdf8",       // 亮蓝色
      tertiary: "#22d3ee",        // 亮青色
      highlight: "rgba(56, 189, 248, 0.15)",
      textHighlight: "#fef3c788",
    },
  },

  /**
   * 墨韵主题 - 优雅、简约、适合阅读
   */
  inkElegance: {
    name: "墨韵",
    description: "优雅的黑白灰配色，极简设计，专注内容",
    lightMode: {
      light: "#ffffff",           // 纯白背景
      lightgray: "#f5f5f5",       // 浅灰
      gray: "#9ca3af",            // 中灰
      darkgray: "#374151",        // 深灰
      dark: "#111827",            // 接近黑
      secondary: "#4b5563",       // 深灰（链接）
      tertiary: "#6b7280",        // 中深灰（强调）
      highlight: "rgba(75, 85, 99, 0.08)",
      textHighlight: "#fef3c788",
    },
    darkMode: {
      light: "#0a0a0a",           // 接近纯黑
      lightgray: "#1a1a1a",       // 深灰黑
      gray: "#525252",            // 中灰
      darkgray: "#d4d4d4",        // 浅灰
      dark: "#fafafa",            // 浅色文字
      secondary: "#a3a3a3",       // 浅灰（链接）
      tertiary: "#d4d4d4",        // 更浅灰（强调）
      highlight: "rgba(163, 163, 163, 0.12)",
      textHighlight: "#fef3c766",
    },
  },
}
