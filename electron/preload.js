/**
 * 预加载脚本：仅暴露一个极小的只读标记，供前端识别桌面环境
 * （路由切换 HashRouter 等）。不含任何特权 API。
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('leafstoryDesktop', {
  desktop: true,
  versions: { electron: process.versions.electron },
})
