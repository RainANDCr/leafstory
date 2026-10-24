/** 设置页的 AI（BYOK）卡片：配置仅存内存，刷新即清空，绝不持久化 */
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useAiSettings } from './AiSettings'
import { zhCN } from '@/i18n'

export function AiSettingsCard() {
  const { settings, isReady, save, clear } = useAiSettings()
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [model, setModel] = useState(settings.model)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [mock, setMock] = useState(settings.mock)

  const inputCls =
    'mt-1 w-full min-h-11 rounded-2xl border border-paper-edge bg-paper px-3.5 py-2 text-sm text-bark placeholder:text-bark-soft/60'
  const labelCls = 'block text-sm font-medium text-bark'

  return (
    <Card className="mb-4">
      <h2 className="mb-1 text-sm font-medium text-bark-soft">{zhCN.ai.settingsTitle}</h2>
      <p className="mb-3 text-xs leading-5 text-bark-soft">{zhCN.ai.desc}</p>

      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${isReady ? 'bg-forest' : 'bg-paper-edge'}`} />
        <p className="text-sm text-bark">
          {settings.mock ? zhCN.ai.mockOn : isReady ? zhCN.ai.configured : zhCN.ai.notConfigured}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="ai-base-url">
              {zhCN.ai.baseUrlLabel}
            </label>
            <input
              id="ai-base-url"
              className={inputCls}
              placeholder={zhCN.ai.baseUrlPlaceholder}
              value={baseUrl}
              autoComplete="off"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ai-model">
              {zhCN.ai.modelLabel}
            </label>
            <input
              id="ai-model"
              className={inputCls}
              placeholder={zhCN.ai.modelPlaceholder}
              value={model}
              autoComplete="off"
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="ai-key">
            {zhCN.ai.keyLabel}
          </label>
          <input
            id="ai-key"
            type="password"
            className={inputCls}
            value={apiKey}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="mt-1 text-xs text-bark-soft">{zhCN.ai.keyHint}</p>
        </div>

        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-4 w-4 accent-bark" checked={mock} onChange={(e) => setMock(e.target.checked)} />
          <span className="text-sm text-bark">{zhCN.ai.mockLabel}</span>
        </label>

        <div className="flex gap-2">
          <Button onClick={() => save({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim(), mock })}>
            {zhCN.ai.saveSettings}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setBaseUrl('')
              setModel('')
              setApiKey('')
              setMock(false)
              clear()
            }}
          >
            {zhCN.ai.clearSettings}
          </Button>
        </div>
      </div>
    </Card>
  )
}
