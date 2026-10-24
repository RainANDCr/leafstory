/**
 * 极简文案读取入口。
 *
 * 用点路径取文案：t('forest.title')。当前只挂简体中文字典；
 * 将来扩展语言时在此切换字典或升级为 React Context 均可，
 * 组件层无需改动。
 */
import { zhCN } from './zh-CN'

type Dict = { [key: string]: string | Dict }

export function t(path: string): string {
  let node: unknown = zhCN
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return path
    node = (node as Dict)[part]
  }
  return typeof node === 'string' ? node : path
}

export { zhCN }
