/**
 * 回忆之树（阶段 0 占位版，可整体替换）。
 *
 * - 原创手绘风 SVG：树干分叉 + 团簇树冠 + 边缘叶片，无第三方素材。
 * - 季节只影响外观配色（春发芽 / 夏茂盛 / 秋暖金 / 冬枝干），
 *   不影响任何真实数据；默认按本机月份推算。
 * - 阶段 2 将在此基础上接入真实日记数据（叶片可点击）与
 *   “新叶长出”动效；此处刻意保持元素数量克制。
 */
import { useId } from 'react'
import { seasonOf, type Season } from '../season'

interface SeasonPalette {
  canopy: readonly string[]
  ground: string
  accent: string
  /** 特别的金叶（未来对应纪念日 / 已实现的心愿） */
  special: string
}

const palettes: Record<Season, SeasonPalette> = {
  spring: { canopy: ['#9db482', '#b6c79a', '#8aa273'], ground: '#c7d3ab', accent: '#d9a7b8', special: '#e8c368' },
  summer: { canopy: ['#75816b', '#8a9b7a', '#5f6a57'], ground: '#aebf94', accent: '#8a9b7a', special: '#e8c368' },
  autumn: { canopy: ['#c99d4a', '#d9b36a', '#b96f57', '#d89a5b'], ground: '#ddc79b', accent: '#b96f57', special: '#e0b45c' },
  winter: { canopy: ['#a99e90', '#bdb3a5', '#8f8578'], ground: '#ece5d9', accent: '#cfd8de', special: '#e0b45c' },
}

interface MemoryTreeProps {
  season?: Season
  className?: string
  /** 无障碍描述 */
  label?: string
}

/** 单片叶子的路径（以 (0,0) 为叶柄底部中心） */
function leafPath(scale: number): string {
  const w = 5 * scale
  const h = 12 * scale
  return `M0 0 C ${w} ${-h * 0.28} ${w * 0.7} ${-h * 0.78} 0 ${-h} C ${-w * 0.7} ${-h * 0.78} ${-w} ${-h * 0.28} 0 0 Z`
}

export function MemoryTree({ season, className, label = '回忆之树' }: MemoryTreeProps) {
  const current = season ?? seasonOf()
  const p = palettes[current]
  const gradientId = useId()

  const canopy: ReadonlyArray<readonly [number, number, number]> =
    current === 'winter'
      ? // 冬季：树冠稀疏，枝干为主，仅留少量暖色叶
        [
          [180, 104, 26],
          [136, 130, 18],
          [226, 128, 18],
          [180, 66, 16],
        ]
      : [
          [180, 100, 52],
          [132, 128, 36],
          [228, 126, 36],
          [160, 146, 30],
          [202, 146, 30],
          [110, 150, 24],
          [252, 148, 24],
        ]

  const edgeLeaves: ReadonlyArray<readonly [number, number, number, number]> =
    current === 'winter'
      ? [
          [152, 78, 1, -18],
          [214, 74, 1, 16],
        ]
      : [
          [95, 142, 1, -40],
          [266, 138, 1, 38],
          [148, 58, 1, -12],
          [216, 56, 1, 14],
          [180, 40, 0.9, 2],
        ]

  // 两片特别的金叶（形状略大并带描边，兼顾色觉差异；阶段 2 起对应纪念日/心愿）
  const specialLeaves: ReadonlyArray<readonly [number, number, number]> = [
    [252, 104, 1.5],
    [112, 100, 1.4],
  ]

  return (
    <svg viewBox="0 0 360 320" role="img" aria-label={label} className={className}>
      <defs>
        <linearGradient id={`trunk-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b5544" />
          <stop offset="55%" stopColor="#594638" />
          <stop offset="100%" stopColor="#43352a" />
        </linearGradient>
      </defs>

      {/* 地面 */}
      <ellipse cx="180" cy="290" rx="140" ry="16" fill="#e7dfd2" />
      <ellipse cx="180" cy="289" rx="98" ry="10" fill={p.ground} opacity="0.85" />
      {/* 草丛点缀 */}
      <path
        d="M92 288c3-6 5-8 9-10M120 292c2-5 4-7 8-9M246 290c3-5 5-7 9-9M272 287c2-6 4-8 8-10"
        stroke={current === 'winter' ? '#b3a894' : '#75816b'}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />

      {/* 树干与主枝 */}
      <path
        d="M164 292 C166 250 158 212 146 182 L162 174 C170 204 176 234 180 258 C184 234 190 204 200 176 L216 184 C204 214 196 252 194 292 Z"
        fill={`url(#trunk-${gradientId})`}
      />
      <path
        d="M150 186 C136 170 126 158 116 150 M212 184 C226 168 238 156 248 148 M180 258 C180 232 180 208 180 188"
        stroke="#594638"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* 树冠 */}
      <g>
        {canopy.map(([cx, cy, r], i) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={p.canopy[i % p.canopy.length]} opacity={0.94} />
        ))}
      </g>

      {/* 边缘装饰叶片 */}
      <g>
        {edgeLeaves.map(([x, y, s, rot], i) => (
          <path
            key={`edge-${i}`}
            d={leafPath(s)}
            transform={`translate(${x} ${y}) rotate(${rot})`}
            fill={i % 2 === 0 ? p.accent : p.canopy[i % p.canopy.length]}
          />
        ))}
        {/* 特别的金叶 */}
        {specialLeaves.map(([x, y, s], i) => (
          <g key={`special-${i}`} transform={`translate(${x} ${y}) rotate(${i === 0 ? 22 : -20})`}>
            <path d={leafPath(s)} fill={p.special} stroke="#a67c2e" strokeWidth="1.4" />
            <path d={`M0 0 L0 ${-11 * s}`} stroke="#a67c2e" strokeWidth="1" opacity="0.7" />
          </g>
        ))}
      </g>

      {/* 冬季雪点 */}
      {current === 'winter' ? (
        <g fill="#ffffff" opacity="0.9">
          <circle cx="150" cy="96" r="3" />
          <circle cx="204" cy="88" r="2.6" />
          <circle cx="180" cy="118" r="2.2" />
          <circle cx="130" cy="246" r="2.4" />
          <circle cx="226" cy="252" r="2.2" />
        </g>
      ) : null}
    </svg>
  )
}
