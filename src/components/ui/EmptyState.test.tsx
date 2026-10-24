import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'
import { LeafIcon } from '@/components/layout/icons'

describe('EmptyState', () => {
  it('渲染标题与描述', () => {
    render(<EmptyState title="第一片叶子，等你写下" description="写下今天的一件小事。" />)
    expect(screen.getByRole('heading', { name: '第一片叶子，等你写下' })).toBeInTheDocument()
    expect(screen.getByText('写下今天的一件小事。')).toBeInTheDocument()
  })

  it('渲染可选图标与操作', () => {
    render(
      <EmptyState
        icon={<LeafIcon data-testid="leaf-icon" />}
        title="空状态"
        action={<button type="button">去写日记</button>}
      />,
    )
    expect(screen.getByTestId('leaf-icon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '去写日记' })).toBeInTheDocument()
  })
})
