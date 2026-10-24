import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

/**
 * 全局 Provider：目前只有 TanStack Query（服务器状态缓存）。
 * 主题/语言等 Context 在需要时再按序加入，保持克制。
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // useState 保证 StrictMode 下不会重复创建客户端
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
