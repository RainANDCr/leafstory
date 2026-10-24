/**
 * Electron 主进程：加载同一份 Web 构建产物（dist/）。
 * - 外部链接（邮箱验证等）交给系统默认浏览器打开；
 * - 不内嵌任何私密 Key：Supabase anon key 由构建期注入（可公开值）；
 * - 桌面端路由使用 HashRouter（见 src/app/router.tsx），file:// 下正常工作。
 */
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 430,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#F8F4EB',
    autoHideMenuBar: true,
    title: '落叶物语',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  })

  win.loadFile(path.join(__dirname, '../dist/index.html'))

  // 目标为外部 http(s) 的新窗口 → 系统浏览器（登录/验证邮件链接等）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 页内导航仅允许应用自身（file://），其余交给系统浏览器
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
