/** 个人数据导出：只收集当前用户有权查看的内容，带进度与取消。 */
import { getProfile } from './profileService'
import { getCoupleSnapshot } from './coupleService'
import { getDiaryDetail, listDiaries } from './diaryService'
import { listWishes } from './wishService'
import { listAnniversaries } from './anniversaryService'
import { listPlaces } from './placeService'
import { listStoryBooks } from './storyService'
import { listLetters, readLetter } from './letterService'
import { listQuizSessions } from './quizService'
import { getGoldenLeaf } from './goldenLeafService'
import { isSupabaseConfigured } from '@/lib/env'

export interface ExportOptions {
  includePhotos: boolean
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface ExportResult {
  json: string
  photoCount: number
  skippedPhotos: number
}

interface PhotoPayload {
  diaryId: string
  fileName: string
  dataUrl: string
}

/** 单张照片上限 8MB（dataUrl 前），超过跳过并计数 */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const MAX_PHOTOS = 60

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 导出本人可见数据：
 * - 日记：分页拉全（可见性由服务层/RLS 保证——伴侣私密日记不会出现）；
 * - 信件：只有封套；正文仅在可读（作者或已到期已解锁）时尝试 readLetter；
 * - 问答：myAnswer 全量；partnerAnswer 仅在已揭晓可见时由 listQuizSessions 返回；
 * - 照片：可选逐张转 dataUrl（仅可见日记的媒体），带进度与取消。
 */
export async function exportMyData(userId: string, options: ExportOptions): Promise<ExportResult> {
  const { includePhotos, onProgress, signal } = options

  const profile = await getProfile(userId)
  checkCancelled(signal)
  const couple = await getCoupleSnapshot(userId)
  checkCancelled(signal)

  const payload: Record<string, unknown> = {
    app: '落叶物语',
    exportedAt: new Date().toISOString(),
    mode: isSupabaseConfigured ? 'cloud' : 'local',
    profile,
    couple: null as unknown,
  }

  const photos: PhotoPayload[] = []
  let skippedPhotos = 0

  if (couple.info) {
    // 日记（分页全量）
    const diaries: unknown[] = []
    let page = 0
    for (;;) {
      const result = await listDiaries(page)
      checkCancelled(signal)
      diaries.push(...result.items)
      if (!result.hasMore) break
      page += 1
    }

    if (includePhotos && diaries.length > 0) {
      onProgress?.(0, Math.min(diaries.length, MAX_PHOTOS))
      let done = 0
      for (const entry of diaries) {
        checkCancelled(signal)
        if (photos.length >= MAX_PHOTOS) {
          skippedPhotos += 1
          continue
        }
        try {
          const detail = await getDiaryDetail((entry as { id: string }).id)
          for (let i = 0; i < detail.mediaUrls.length; i++) {
            checkCancelled(signal)
            const url = detail.mediaUrls[i]!
            const res = await fetch(url)
            if (!res.ok) {
              skippedPhotos += 1
              continue
            }
            const blob = await res.blob()
            if (blob.size > MAX_PHOTO_BYTES) {
              skippedPhotos += 1
              continue
            }
            photos.push({
              diaryId: detail.entry.id,
              fileName: detail.media[i]?.fileName ?? '',
              dataUrl: await blobToDataUrl(blob),
            })
          }
        } catch {
          skippedPhotos += 1
        }
        done += 1
        onProgress?.(Math.min(done, MAX_PHOTOS), Math.min(diaries.length, MAX_PHOTOS))
      }
    }

    // 信件：封套 + 可读正文（作者随时可读；收件人到期能读；否则只有封套）
    const envelopes = await listLetters(couple.info.coupleId)
    checkCancelled(signal)
    const letters = await Promise.all(
      envelopes.map(async (env) => {
        checkCancelled(signal)
        // 未到期/已撤回：readLetter 被拒 → 只导出封套，不含正文
        const content = await readLetter(env.id).then(
          (read) => ({ title: read.title, body: read.body }),
          () => null,
        )
        return { ...env, content }
      }),
    )

    const coupleId = couple.info.coupleId
    const partner = couple.info.members.find((m) => m.userId !== userId) ?? null
    const quizzes = await listQuizSessions(coupleId, userId, partner?.userId ?? null)
    checkCancelled(signal)

    const thisYear = new Date().getFullYear()
    const goldenLeaf = await getGoldenLeaf(coupleId, thisYear).catch(() => null)

    payload.couple = {
      info: couple.info,
      diaries,
      wishes: await listWishes(coupleId),
      anniversaries: await listAnniversaries(coupleId),
      places: await listPlaces(coupleId),
      storyBooks: await listStoryBooks(coupleId),
      letters,
      quizzes,
      goldenLeafThisYear: goldenLeaf,
      photosIncluded: photos.length,
      photosSkipped: skippedPhotos,
      note: '仅包含导出时你有权查看的内容；伴侣的私密日记、未到期信件正文、未揭晓的回答均不在其中。导出的副本不再受应用内权限控制。',
    }
    payload.photos = photos
  }

  const json = JSON.stringify(payload, null, 2)
  return { json, photoCount: photos.length, skippedPhotos }
}

/** 触发浏览器下载 */
export function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
