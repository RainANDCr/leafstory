/**
 * 平台适配层接口。
 *
 * 所有涉及浏览器 / 原生（Android Capacitor）差异的能力都必须收敛到这里，
 * 业务组件只依赖本接口，不直接调用 window.* 或 Capacitor 插件。
 * 阶段 7 打包 Android 时新增 capacitor.ts 实现并在 index.ts 切换。
 */
export type PlatformName = 'web' | 'android'

export interface PlatformAdapter {
  readonly name: PlatformName
  /** 人类可读的平台名，用于诊断信息展示 */
  readonly label: string

  /**
   * 本地通知（阶段 7 起用于纪念日提醒）。
   * Web 端当前为空实现；Android 端将申请运行时权限后调用本地通知。
   */
  readonly notifications: {
    /** 当前是否可用（权限已授予且平台支持） */
    isAvailable(): Promise<boolean>
    /** 申请权限；用户拒绝时返回 false，不抛错 */
    requestPermission(): Promise<boolean>
    /** 安排一条本地通知；id 由调用方生成以便取消 */
    schedule(input: { id: string; title: string; body: string; fireAt: Date }): Promise<void>
    cancel(id: string): Promise<void>
  }
}
