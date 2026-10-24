/**
 * AI 配置上下文：仅保存在内存（React state）。
 * 不写 localStorage / sessionStorage / URL —— 刷新即失效，需要重新输入；
 * 这是本阶段有意的安全取舍（不做跨会话持久化）。
 */
import { createContext, useContext, useState, type ReactNode } from 'react'

export interface AiSettingsState {
  /** OpenAI 兼容接口地址，如 https://api.openai.com/v1 */
  baseUrl: string
  model: string
  apiKey: string
  /** 演示模式：不联网，本地模拟结果 */
  mock: boolean
}

export interface AiSettingsContextValue {
  settings: AiSettingsState
  isReady: boolean
  save(next: AiSettingsState): void
  clear(): void
}

const DEFAULT_SETTINGS: AiSettingsState = {
  baseUrl: '',
  model: '',
  apiKey: '',
  mock: false,
}

const AiSettingsContext = createContext<AiSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  isReady: false,
  save: () => {},
  clear: () => {},
})

export function AiSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AiSettingsState>(DEFAULT_SETTINGS)
  const isReady = settings.mock || (Boolean(settings.baseUrl && settings.model && settings.apiKey))
  return (
    <AiSettingsContext.Provider
      value={{ settings, isReady, save: (next) => setSettings({ ...next }), clear: () => setSettings(DEFAULT_SETTINGS) }}
    >
      {children}
    </AiSettingsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAiSettings(): AiSettingsContextValue {
  return useContext(AiSettingsContext)
}
