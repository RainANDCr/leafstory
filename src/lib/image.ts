/**
 * 图片上传前压缩：大图按最长边缩放到 maxDim、统一转 JPEG。
 * 属于客户端优化；权限与路径安全仍由 Storage RLS 把关。
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 单张原始上限 10MB
export const MAX_MEDIA_PER_ENTRY = 9

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export async function resizeImage(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), 'image/jpeg', quality)
    })
    return blob
  } finally {
    bitmap.close()
  }
}
