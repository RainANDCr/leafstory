/** 设置页「数据管理」卡片：隐私说明、JSON 导出（进度/取消）、批量删日记、解除配对、设备数据 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/features/auth/AuthContext'
import { useCoupleSnapshot } from '@/features/couple/useCoupleSnapshot'
import { downloadJson, exportMyData } from '@/services/exportService'
import { deleteAllMyDiaries, listDiaries } from '@/services/diaryService'
import { dissolveCouple } from '@/services/coupleService'
import { isSupabaseConfigured } from '@/lib/env'
import { clearAllLocalData } from '@/services/local/localDb'
import { getErrorMessage } from '@/lib/errors'
import { zhCN } from '@/i18n'

export function DataManagementCard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { userId } = useAuth()
  const coupleQuery = useCoupleSnapshot()
  const coupleId = coupleQuery.data?.info?.coupleId ?? null

  const [includePhotos, setIncludePhotos] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [exportAbort, setExportAbort] = useState<AbortController | null>(null)

  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const myCountQuery = useQuery({
    queryKey: ['myDiaryCount', userId],
    queryFn: async () => (await listDiaries(0, { authorId: userId ?? undefined })).total,
    enabled: Boolean(userId),
  })

  const deleteAllMutation = useMutation({
    mutationFn: () => deleteAllMyDiaries(userId!),
    onSuccess: (n) => {
      setDeleteAllOpen(false)
      setNotice(zhCN.dataMgmt.deleteDiariesDone(n))
      void qc.invalidateQueries({ queryKey: ['diaries'] })
      void qc.invalidateQueries({ queryKey: ['myDiaryCount'] })
      void qc.invalidateQueries({ queryKey: ['sharedDiaries'] })
    },
    onError: (err) => {
      setDeleteAllOpen(false)
      setError(getErrorMessage(err))
    },
  })

  const dissolveMutation = useMutation({
    mutationFn: () => dissolveCouple(),
    onSuccess: () => {
      setDissolveOpen(false)
      setNotice(zhCN.dataMgmt.dissolved)
      void qc.invalidateQueries()
      navigate('/pairing', { replace: true })
    },
    onError: (err) => {
      setDissolveOpen(false)
      setError(getErrorMessage(err))
    },
  })

  async function runExport() {
    if (!userId) return
    setError('')
    setNotice('')
    const controller = new AbortController()
    abortRef.current = controller
    setExportAbort(controller)
    setProgress(zhCN.dataMgmt.exporting(0, 1))
    try {
      const result = await exportMyData(userId, {
        includePhotos,
        signal: controller.signal,
        onProgress: (done, total) => setProgress(zhCN.dataMgmt.exporting(done, total)),
      })
      downloadJson(result.json, `leafstory-export-${new Date().toISOString().slice(0, 10)}.json`)
      setNotice(zhCN.dataMgmt.exportDone)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setNotice(zhCN.dataMgmt.exportCancelled)
      } else {
        setError(zhCN.dataMgmt.exportFailed)
      }
    } finally {
      setProgress(null)
      setExportAbort(null)
      abortRef.current = null
    }
  }

  const myCount = myCountQuery.data ?? 0

  return (
    <>
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-medium text-bark-soft">{zhCN.dataMgmt.title}</h2>

        {/* 隐私说明 */}
        <div className="mb-5 rounded-2xl bg-paper-deep p-3.5">
          <p className="text-sm font-medium text-bark">{zhCN.dataMgmt.privacyTitle}</p>
          <p className="mt-1 text-xs leading-5 text-bark-soft">{zhCN.dataMgmt.privacyDesc}</p>
        </div>

        {/* 导出 */}
        <div className="mb-5">
          <p className="text-sm font-medium text-bark">{zhCN.dataMgmt.exportTitle}</p>
          <p className="mt-1 text-xs leading-5 text-bark-soft">{zhCN.dataMgmt.exportDesc}</p>
          <label className="mt-2.5 flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-bark" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
            <span className="text-xs text-bark">{zhCN.dataMgmt.includePhotos}</span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void runExport()} disabled={progress !== null || !userId}>
              {zhCN.dataMgmt.exportAction}
            </Button>
            {progress !== null && exportAbort ? (
              <Button variant="ghost" onClick={() => exportAbort.abort()}>
                {zhCN.common.cancel}
              </Button>
            ) : null}
          </div>
          {progress !== null ? (
            <p role="status" className="mt-2 text-xs text-bark-soft">
              {progress}
            </p>
          ) : null}
        </div>

        {/* 删除我的全部日记 */}
        <div className="mb-5 border-t border-paper-edge/70 pt-4">
          <p className="text-sm font-medium text-maple">{zhCN.dataMgmt.deleteDiariesTitle}</p>
          <p className="mt-1 text-xs leading-5 text-bark-soft">{zhCN.dataMgmt.deleteDiariesDesc(myCount)}</p>
          <Button className="mt-3 bg-maple hover:bg-maple/85" disabled={myCount === 0} onClick={() => setDeleteAllOpen(true)}>
            {zhCN.dataMgmt.deleteDiariesAction}
          </Button>
        </div>

        {/* 解除配对 */}
        {coupleId ? (
          <div className="mb-5 border-t border-paper-edge/70 pt-4">
            <p className="text-sm font-medium text-maple">{zhCN.dataMgmt.dissolveTitle}</p>
            <p className="mt-1 text-xs leading-5 text-bark-soft">{zhCN.dataMgmt.dissolveDesc}</p>
            <Button className="mt-3 bg-maple hover:bg-maple/85" onClick={() => setDissolveOpen(true)}>
              {zhCN.dataMgmt.dissolveAction}
            </Button>
          </div>
        ) : null}

        {/* 账户与本设备 */}
        <div className="border-t border-paper-edge/70 pt-4">
          <p className="text-sm font-medium text-bark">{zhCN.dataMgmt.accountTitle}</p>
          <p className="mt-1 text-xs leading-5 text-bark-soft">
            {isSupabaseConfigured ? zhCN.dataMgmt.accountCloudDesc : zhCN.dataMgmt.accountLocalDesc}
          </p>
          {!isSupabaseConfigured ? (
            <Button className="mt-3 bg-maple hover:bg-maple/85" onClick={() => setWipeOpen(true)}>
              {zhCN.dataMgmt.deleteLocalAction}
            </Button>
          ) : null}
        </div>

        {notice ? (
          <p role="status" className="mt-4 rounded-2xl bg-forest/10 p-3 text-sm text-forest-deep">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-2xl border border-maple/40 bg-maple/5 p-3 text-sm text-maple">
            {error}
          </p>
        ) : null}
      </Card>

      <ConfirmDialog
        open={deleteAllOpen}
        title={zhCN.dataMgmt.deleteDiariesTitle}
        description={zhCN.dataMgmt.deleteDiariesDesc(myCount)}
        confirmLabel={zhCN.common.delete}
        danger
        busy={deleteAllMutation.isPending}
        onConfirm={() => deleteAllMutation.mutate()}
        onCancel={() => setDeleteAllOpen(false)}
      />

      <ConfirmDialog
        open={dissolveOpen}
        title={zhCN.dataMgmt.dissolveConfirmTitle}
        description={zhCN.dataMgmt.dissolveConfirmBody}
        confirmLabel={zhCN.dataMgmt.dissolveAction}
        danger
        busy={dissolveMutation.isPending}
        onConfirm={() => dissolveMutation.mutate()}
        onCancel={() => setDissolveOpen(false)}
      />

      <ConfirmDialog
        open={wipeOpen}
        title={zhCN.dataMgmt.deleteLocalConfirmTitle}
        description={zhCN.dataMgmt.deleteLocalConfirmBody}
        confirmLabel={zhCN.dataMgmt.deleteLocalAction}
        danger
        onConfirm={() => {
          setWipeOpen(false)
          clearAllLocalData()
          window.location.href = '/login'
        }}
        onCancel={() => setWipeOpen(false)}
      />
    </>
  )
}
