/**
 * 日记数据访问：分页列表（搜索/筛选）、详情、增删改、照片上传与签名 URL。
 * 可见性完全由数据库 RLS 决定，本层不做也不信任前端权限判断。
 */
import { getSupabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'
import { MAX_MEDIA_PER_ENTRY, resizeImage } from '@/lib/image'
import type { DiaryEntry, DiaryFilter, DiaryInput, DiaryMedia } from '@/features/diary/types'
import * as local from './local/localBackend'

const PAGE_SIZE = 10
const BUCKET = 'diary-media'

function requireSupabase() {
  const sb = getSupabase()
  if (!sb) throw new Error('数据库尚未连接')
  return sb
}

interface EntryRow {
  id: string
  couple_id: string
  author_id: string
  title: string
  content: string
  happened_on: string
  mood: string
  category: string | null
  visibility: 'shared' | 'private'
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
  diary_media?: Array<{ count: number }>
}

function toEntry(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    coupleId: row.couple_id,
    authorId: row.author_id,
    title: row.title,
    content: row.content,
    happenedOn: row.happened_on,
    mood: row.mood,
    category: row.category,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaCount: row.diary_media?.[0]?.count ?? 0,
  }
}

export interface DiaryPage {
  items: DiaryEntry[]
  total: number
  hasMore: boolean
}

export async function listDiaries(page: number, filter: DiaryFilter = {}): Promise<DiaryPage> {
  if (!isSupabaseConfigured) return local.listDiaries(page, filter)
  const sb = requireSupabase()
  let query = sb
    .from('diary_entries')
    .select('id, couple_id, author_id, title, content, happened_on, mood, category, visibility, status, created_at, updated_at, diary_media(count)', { count: 'exact' })
    .order('happened_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (filter.mood) query = query.eq('mood', filter.mood)
  if (filter.authorId) query = query.eq('author_id', filter.authorId)
  if (filter.search && filter.search.trim()) {
    // 逗号会破坏 or() 语法，替换为中文逗号
    const kw = filter.search.trim().replaceAll(',', '，')
    query = query.or(`title.ilike.%${kw}%,content.ilike.%${kw}%`)
  }

  const { data, error, count } = await query
  if (error) throw error
  const items = (data as EntryRow[]).map(toEntry)
  return { items, total: count ?? items.length, hasMore: (page + 1) * PAGE_SIZE < (count ?? 0) }
}

/** 首页回忆树：双方可见的已发布日记（叶片数据源），限制条数 */
export async function listSharedDiariesForTree(limit = 200): Promise<DiaryEntry[]> {
  if (!isSupabaseConfigured) return local.listSharedDiariesForTree(limit)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('diary_entries')
    .select('id, couple_id, author_id, title, content, happened_on, mood, category, visibility, status, created_at, updated_at')
    .eq('visibility', 'shared')
    .eq('status', 'published')
    .order('happened_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as EntryRow[]).map(toEntry)
}

/** 故事书数据源：当前用户可见的全部日记（按发生日期倒序，限量聚合） */
export async function listVisibleDiariesForStory(limit = 500): Promise<DiaryEntry[]> {
  if (!isSupabaseConfigured) return local.listVisibleDiariesForStory(limit)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('diary_entries')
    .select('id, couple_id, author_id, title, content, happened_on, mood, category, visibility, status, created_at, updated_at')
    .order('happened_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as EntryRow[]).map(toEntry)
}

async function getMedia(entryId: string): Promise<DiaryMedia[]> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('diary_media')
    .select('id, diary_entry_id, storage_path, file_name, position')
    .eq('diary_entry_id', entryId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    diaryEntryId: m.diary_entry_id,
    storagePath: m.storage_path,
    fileName: m.file_name,
    position: m.position,
  }))
}

export interface DiaryDetail {
  entry: DiaryEntry
  media: DiaryMedia[]
  mediaUrls: string[] // 与 media 一一对应的短期签名 URL
}

export async function getDiaryDetail(id: string): Promise<DiaryDetail> {
  if (!isSupabaseConfigured) return local.getDiaryDetail(id)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('diary_entries')
    .select('id, couple_id, author_id, title, content, happened_on, mood, category, visibility, status, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')

  const entry = toEntry(data as EntryRow)
  const media = await getMedia(id)
  const mediaUrls = await Promise.all(media.map((m) => createMediaSignedUrl(m.storagePath)))
  return { entry, media, mediaUrls }
}

export async function createDiary(input: DiaryInput): Promise<string> {
  if (!isSupabaseConfigured) return local.createDiary(input)
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('diary_entries')
    .insert({
      couple_id: input.coupleId,
      author_id: (await sb.auth.getUser()).data.user?.id,
      title: input.title.trim(),
      content: input.content,
      happened_on: input.happenedOn,
      mood: input.mood,
      category: input.category?.trim() || null,
      visibility: input.visibility,
      status: input.status,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateDiary(
  id: string,
  patch: Partial<Pick<DiaryInput, 'title' | 'content' | 'happenedOn' | 'mood' | 'category' | 'visibility' | 'status'>>,
): Promise<void> {
  if (!isSupabaseConfigured) return local.updateDiary(id, patch)
  const sb = requireSupabase()
  const { error } = await sb.from('diary_entries').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteDiary(coupleId: string, entryId: string): Promise<void> {
  if (!isSupabaseConfigured) return local.deleteDiary(coupleId, entryId)
  const sb = requireSupabase()
  // 先清理 Storage 里该日记的文件（列出前缀下的对象），再删行（media 行级联删除）
  const folder = `couple/${coupleId}/diary/${entryId}`
  const { data: objects, error: listError } = await sb.storage.from(BUCKET).list(folder)
  if (!listError && objects && objects.length > 0) {
    const paths = objects.map((o) => `${folder}/${o.name}`)
    await sb.storage.from(BUCKET).remove(paths)
  }
  const { error } = await sb.from('diary_entries').delete().eq('id', entryId)
  if (error) throw error
}

function mediaPath(coupleId: string, entryId: string): string {
  const uid = crypto.randomUUID()
  return `couple/${coupleId}/diary/${entryId}/${uid}.jpg`
}

/** 压缩并上传新照片，写入元数据行；返回失败文件名列表 */
export async function uploadDiaryMedia(
  userId: string,
  coupleId: string,
  entryId: string,
  files: File[],
  startPosition: number,
): Promise<string[]> {
  if (!isSupabaseConfigured) return local.uploadDiaryMedia(userId, coupleId, entryId, files, startPosition)
  const sb = requireSupabase()
  const failed: string[] = []
  let position = startPosition

  for (const file of files.slice(0, MAX_MEDIA_PER_ENTRY)) {
    try {
      const blob = await resizeImage(file)
      const path = mediaPath(coupleId, entryId)
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (upErr) throw upErr
      const { error: rowErr } = await sb.from('diary_media').insert({
        diary_entry_id: entryId,
        storage_path: path,
        file_name: file.name,
        mime_type: 'image/jpeg',
        size_bytes: blob.size,
        position: position++,
        uploaded_by: userId,
      })
      if (rowErr) throw rowErr
    } catch {
      failed.push(file.name)
    }
  }
  return failed
}

/** 删除已上传照片：Storage 对象 + 元数据行 */
export async function removeDiaryMedia(media: DiaryMedia): Promise<void> {
  if (!isSupabaseConfigured) return local.removeDiaryMedia(media)
  const sb = requireSupabase()
  const { error: rowErr } = await sb.from('diary_media').delete().eq('id', media.id)
  if (rowErr) throw rowErr
  await sb.storage.from(BUCKET).remove([media.storagePath])
}

export async function createMediaSignedUrl(path: string, expiresInSec = 3600): Promise<string> {
  if (!isSupabaseConfigured) return local.createMediaSignedUrl(path)
  const sb = requireSupabase()
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresInSec)
  if (error || !data) throw error ?? new Error('签名 URL 创建失败')
  return data.signedUrl
}
