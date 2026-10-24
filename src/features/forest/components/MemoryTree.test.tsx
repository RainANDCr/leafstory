/** 回忆树交互测试：叶片预览卡 → 查看全文导航；金叶预览 */
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MemoryTree } from './MemoryTree'

const leaves = [
  { id: 'e1', mood: 'joy', title: '一起看海', happenedOn: '2026-10-24', snippet: '浪很大，风很轻。' },
]
const goldLeaves = [{ id: 'a1', title: '在一起', text: '还有 30 天' }]

function renderTree() {
  return render(
    <MemoryRouter initialEntries={['/forest']}>
      <Routes>
        <Route path="/forest" element={<div>森林</div>} />
        <Route path="/diary/:id" element={<div>日记详情页</div>} />
        <Route path="/footprints" element={<div>足迹页</div>} />
      </Routes>
      <MemoryTree leaves={leaves} goldLeaves={goldLeaves} />
    </MemoryRouter>,
  )
}

describe('MemoryTree 交互', () => {
  it('点击日记叶片弹出预览卡，「查看全文」进入详情', () => {
    renderTree()
    fireEvent.click(screen.getByRole('button', { name: '日记：一起看海' }))

    const popover = screen.getByRole('dialog')
    expect(popover).toHaveTextContent('一起看海')
    expect(popover).toHaveTextContent('浪很大')

    fireEvent.click(screen.getByRole('button', { name: '查看全文' }))
    expect(screen.getByText('日记详情页')).toBeInTheDocument()
  })

  it('点击金叶显示纪念日倒计时，可跳转足迹', () => {
    renderTree()
    fireEvent.click(screen.getByRole('button', { name: /在一起 · 还有 30 天/ }))

    const popover = screen.getByRole('dialog')
    expect(popover).toHaveTextContent('还有 30 天')

    fireEvent.click(screen.getByRole('button', { name: '去足迹看看' }))
    expect(screen.getByText('足迹页')).toBeInTheDocument()
  })

  it('预览卡可关闭', () => {
    renderTree()
    fireEvent.click(screen.getByRole('button', { name: '日记：一起看海' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
