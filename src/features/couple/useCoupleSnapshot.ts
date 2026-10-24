/** 配对状态查询 Hook：供森林、日记、足迹、设置、配对页共用 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthContext'
import { getCoupleSnapshot, type CoupleInfo, type CoupleSnapshot } from '@/services/coupleService'

const EMPTY: CoupleSnapshot = { state: 'unpaired', info: null }

export function useCoupleSnapshot() {
  const { userId } = useAuth()
  return useQuery({
    queryKey: ['couple', userId],
    queryFn: () => (userId ? getCoupleSnapshot(userId) : Promise.resolve(EMPTY)),
    enabled: Boolean(userId),
  })
}

/** 配对状态变化后调用（创建/加入/重新生成邀请） */
export function useInvalidateCouple() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['couple'] })
    void qc.invalidateQueries({ queryKey: ['pendingInvitation'] })
  }
}

/** 从空间信息里取「对方」成员；未配对或数据缺失时返回 null */
export function partnerOf(info: CoupleInfo | null, myUserId: string | null) {
  if (!info) return null
  return info.members.find((m) => m.userId !== myUserId) ?? null
}

export type { CoupleInfo, CoupleSnapshot }
