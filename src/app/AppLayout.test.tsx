import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { t } from '@/i18n'

function renderLayout(path = '/forest') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/forest" element={<div>森林内容</div>} />
          <Route path="/diary" element={<div>日记内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('渲染五个一级导航项与设置入口', () => {
    renderLayout()
    for (const label of [t('nav.forest'), t('nav.diary'), t('nav.story'), t('nav.interact'), t('nav.footprints')]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // 移动顶栏 + 桌面侧栏都有设置入口
    const settingsLinks = screen.getAllByRole('link', { name: new RegExp(t('nav.settings')) })
    expect(settingsLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('未配置 Supabase 时显示配置提示，可关闭', async () => {
    const user = userEvent.setup()
    renderLayout()
    const banner = screen.getByRole('note')
    expect(banner).toHaveTextContent(t('setupBanner.title'))

    await user.click(screen.getByRole('button', { name: t('setupBanner.dismiss') }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('渲染页面内容与跳转链接', () => {
    renderLayout()
    expect(screen.getByText('森林内容')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('common.backHome') })).toBeInTheDocument()
  })
})
