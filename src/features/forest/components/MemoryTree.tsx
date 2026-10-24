/**
 * 回忆之树（阶段 2 完整版）。
 *
 * - 季节只影响外观（春发芽/夏茂盛/秋暖金/冬枝干），不影响任何数据。
 * - 日记叶片：椭圆，颜色 = 作者手选的心情；点击弹出预览卡，再进全文；
 *   键盘可操作（Enter 打开预览，Esc 关闭）。
 * - 纪念日金叶：尖叶形状 + 描边（形状区别兼顾色觉障碍），点击显示倒计时。
 * - highlightLeafId：写完日记回到森林时那片新叶播放一次「长出一叶」
 *   动效；prefers-reduced-motion 下由全局样式降级为静态。
 * - 叶片数量有上限（聚合采样），大量记录不会撑爆 DOM。
 */
import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { seasonOf, type Season } from '../season'
import { getMood } from '@/features/diary/types'
import { formatDateHuman } from '@/lib/dates'
import { zhCN } from '@/i18n'

interface SeasonPalette {
  canopy: readonly string[]
  ground: string
  accent: string
  special: string
}

const palettes: Record<Season, SeasonPalette> = {
  spring: { canopy: ['#9db482', '#b6c79a', '#8aa273'], ground: '#c7d3ab', accent: '#d9a7b8', special: '#e8c368' },
  summer: { canopy: ['#75816b', '#8a9b7a', '#5f6a57'], ground: '#aebf94', accent: '#8a9b7a', special: '#e8c368' },
  autumn: { canopy: ['#c99d4a', '#d9b36a', '#b96f57', '#d89a5b'], ground: '#ddc79b', accent: '#b96f57', special: '#e0b45c' },
  winter: { canopy: ['#a99e90', '#bdb3a5', '#8f8578'], ground: '#ece5d9', accent: '#cfd8de', special: '#e0b45c' },
}

/** 日记叶片的固定点位 */
const LEAF_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [140, 120], [170, 95], [200, 120], [228, 100], [160, 150], [195, 150], [120, 145], [250, 140],
  [180, 60], [210, 75], [150, 75], [240, 120], [130, 105], [185, 125], [215, 140], [250, 160],
  [115, 165], [160, 170], [200, 170], [145, 135], [230, 85], [190, 90], [120, 125], [260, 110],
]

/** 纪念日金叶的固定点位（避开日记叶片密集区，靠树冠外缘上方） */
const GOLD_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [98, 108, -24],
  [268, 92, 20],
  [182, 34, 2],
]

export interface TreeLeaf {
  id: string
  mood: string
  title: string
  happenedOn: string
  snippet: string
}

export interface TreeGoldLeaf {
  id: string
  title: string
  /** 倒计时文案，如「还有 30 天」 */
  text: string
}

interface MemoryTreeProps {
  season?: Season
  className?: string
  label?: string
  leaves?: readonly TreeLeaf[]
  goldLeaves?: readonly TreeGoldLeaf[]
  /** 刚写完的日记 ID：对应叶片播放一次生长动效 */
  highlightLeafId?: string | null
}

type Selection =
  | { type: 'diary'; leaf: TreeLeaf; x: number; y: number }
  | { type: 'gold'; leaf: TreeGoldLeaf; x: number; y: number }
  | null

/** 单片尖叶路径（以叶柄底部为原点） */
function leafPath(scale: number): string {
  const w = 5 * scale
  const h = 12 * scale
  return `M0 0 C ${w} ${-h * 0.28} ${w * 0.7} ${-h * 0.78} 0 ${-h} C ${-w * 0.7} ${-h * 0.78} ${-w} ${-h * 0.28} 0 0 Z`
}

export function MemoryTree({ season, className, label = '回忆之树', leaves, goldLeaves, highlightLeafId }: MemoryTreeProps) {
  const current = season ?? seasonOf()
  const p = palettes[current]
  const gradientId = useId()
  const navigate = useNavigate()
  const [selection, setSelection] = useState<Selection>(null)

  const canopy: ReadonlyArray<readonly [number, number, number]> =
    current === 'winter'
      ? [
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
        ]

  const diaryLeaves = (leaves ?? []).slice(0, LEAF_SPOTS.length)
  const golds = (goldLeaves ?? []).slice(0, GOLD_SPOTS.length)

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        viewBox="0 0 360 320"
        role="img"
        aria-label={label}
        className="w-full"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelection(null)
        }}
      >
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

        {/* 纪念日金叶：尖叶形 + 描边（与日记椭圆叶片形状区分） */}
        {golds.map((gold, i) => {
          const [gx, gy, rot] = GOLD_SPOTS[i % GOLD_SPOTS.length]!
          const aria = `${gold.title} · ${gold.text}`
          return (
            <g
              key={gold.id}
              role="button"
              tabIndex={0}
              aria-label={aria}
              className="cursor-pointer"
              onClick={() => setSelection({ type: 'gold', leaf: gold, x: gx, y: gy - 14 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelection({ type: 'gold', leaf: gold, x: gx, y: gy - 14 })
                }
              }}
            >
              <title>{aria}</title>
              <g transform={`translate(${gx} ${gy}) rotate(${rot})`}>
                <path d={leafPath(1.7)} fill={p.special} stroke="#a67c2e" strokeWidth="1.6" />
                <path d="M0 -1 L0 -18" stroke="#a67c2e" strokeWidth="1.2" opacity="0.7" />
              </g>
            </g>
          )
        })}

        {/* 日记叶片：椭圆，颜色 = 心情 */}
        {diaryLeaves.map((leaf, i) => {
          const [x, y] = LEAF_SPOTS[i % LEAF_SPOTS.length]!
          const mood = getMood(leaf.mood)
          const aria = zhCN.forest.leafAria(leaf.title || '无题')
          return (
            <g
              key={leaf.id}
              role="button"
              tabIndex={0}
              aria-label={aria}
              className={`cursor-pointer ${leaf.id === highlightLeafId ? 'leaf-grow' : ''}`}
              onClick={() => setSelection({ type: 'diary', leaf, x, y })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelection({ type: 'diary', leaf, x, y })
                }
              }}
            >
              <title>{aria}</title>
              <ellipse cx={x} cy={y} rx="9" ry="8.5" fill={mood.color} stroke="#594638" strokeOpacity="0.35" strokeWidth="1.2" />
            </g>
          )
        })}

        {/* 边缘装饰叶片 */}
        <g aria-hidden="true">
          {edgeLeaves.map(([x, y, s, rot], i) => (
            <path
              key={`edge-${i}`}
              d={leafPath(s)}
              transform={`translate(${x} ${y}) rotate(${rot})`}
              fill={i % 2 === 0 ? p.accent : p.canopy[i % p.canopy.length]}
            />
          ))}
        </g>

        {/* 冬季雪点 */}
        {current === 'winter' ? (
          <g fill="#ffffff" opacity="0.9" aria-hidden="true">
            <circle cx="150" cy="96" r="3" />
            <circle cx="204" cy="88" r="2.6" />
            <circle cx="180" cy="118" r="2.2" />
            <circle cx="130" cy="246" r="2.4" />
            <circle cx="226" cy="252" r="2.2" />
          </g>
        ) : null}
      </svg>

      {/* 叶片预览卡：再点击「查看全文」进入日记 */}
      {selection ? (
        <div
          role="dialog"
          aria-label={selection.type === 'diary' ? selection.leaf.title || '无题' : selection.leaf.title}
          className="absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-card border border-paper-edge bg-card p-3.5 shadow-lift"
          style={{ left: `${(selection.x / 360) * 100}%`, top: `${(selection.y / 320) * 100}%` }}
        >
          {selection.type === 'diary' ? (
            <>
              <div className="flex items-center gap-2 text-xs text-bark-soft">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getMood(selection.leaf.mood).color }}
                />
                {getMood(selection.leaf.mood).label} · {formatDateHuman(selection.leaf.happenedOn)}
              </div>
              <p className="mt-1.5 font-display text-base text-bark">{selection.leaf.title || '无题'}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-bark-soft">{selection.leaf.snippet}</p>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  className="min-h-9 rounded-xl bg-bark px-3 text-xs font-medium text-paper transition-colors hover:bg-bark-deep"
                  onClick={() => navigate(`/diary/${selection.leaf.id}`)}
                >
                  {zhCN.forest.treePopoverView}
                </button>
                <button type="button" aria-label={zhCN.common.cancel} className="min-h-9 px-2 text-xs text-bark-soft" onClick={() => setSelection(null)}>
                  ✕
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-leaf-gold">
                <span aria-hidden="true">✦</span>
                {zhCN.anniversaries.goldKindHint}
              </div>
              <p className="mt-1.5 font-display text-base text-bark">{selection.leaf.title}</p>
              <p className="mt-1 text-sm text-bark">{selection.leaf.text}</p>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  className="min-h-9 rounded-xl bg-bark px-3 text-xs font-medium text-paper transition-colors hover:bg-bark-deep"
                  onClick={() => navigate('/footprints')}
                >
                  {zhCN.story.goFootprints}
                </button>
                <button type="button" aria-label={zhCN.common.cancel} className="min-h-9 px-2 text-xs text-bark-soft" onClick={() => setSelection(null)}>
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
