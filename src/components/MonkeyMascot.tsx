/**
 * 小猴守护者（原创矢量角色，阶段 0 姿态：坐在树下、捧一片空白叶子）。
 *
 * 角色定位：温暖、俏皮但不低幼的“回忆守护者”。
 * 未来按产品文案扩展姿态：坐在树下 / 捧叶子 / 送金叶 / 抱着空白日记。
 * 禁止使用任何未经授权的现成 IP 形象。
 */

interface MonkeyMascotProps {
  className?: string
  label?: string
}

const FUR = '#8a6a52'
const FUR_DARK = '#75593f'
const SKIN = '#e6cba9'
const INK = '#3a2c22'

export function MonkeyMascot({ className, label = '小猴守护者' }: MonkeyMascotProps) {
  return (
    <svg viewBox="0 0 180 190" role="img" aria-label={label} className={className}>
      {/* 卷起的尾巴 */}
      <path
        d="M138 140 C160 142 168 122 155 112 C148 107 141 112 144 119"
        stroke={FUR}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* 身体 */}
      <ellipse cx="88" cy="128" rx="30" ry="26" fill={FUR} />
      <ellipse cx="88" cy="132" rx="17" ry="15" fill={SKIN} />
      {/* 坐姿腿 */}
      <ellipse cx="70" cy="150" rx="11" ry="7" fill={FUR_DARK} />
      <ellipse cx="106" cy="150" rx="11" ry="7" fill={FUR_DARK} />

      {/* 左臂自然搭在身侧 */}
      <path d="M62 118 C54 124 50 132 53 139" stroke={FUR} strokeWidth="8" strokeLinecap="round" fill="none" />

      {/* 头部与耳朵 */}
      <circle cx="56" cy="72" r="10" fill={FUR} />
      <circle cx="120" cy="72" r="10" fill={FUR} />
      <circle cx="56" cy="72" r="4.5" fill={SKIN} />
      <circle cx="120" cy="72" r="4.5" fill={SKIN} />
      <circle cx="88" cy="76" r="30" fill={FUR} />

      {/* 脸 */}
      <ellipse cx="88" cy="82" rx="20" ry="17" fill={SKIN} />
      {/* 眼睛 */}
      <circle cx="80" cy="72" r="3" fill={INK} />
      <circle cx="96" cy="72" r="3" fill={INK} />
      <circle cx="81" cy="71" r="1" fill="#fff" />
      <circle cx="97" cy="71" r="1" fill="#fff" />
      {/* 鼻子与微笑 */}
      <path d="M85.5 80 Q88 83.5 90.5 80" stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M79 88 Q88 95 97 88" stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* 腮红 */}
      <circle cx="72" cy="84" r="3.2" fill="#d9a08c" opacity="0.55" />
      <circle cx="104" cy="84" r="3.2" fill="#d9a08c" opacity="0.55" />

      {/* 右臂举着一片空白叶子 */}
      <path d="M112 118 C124 112 130 102 128 93" stroke={FUR} strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="128" cy="91" r="5.5" fill={FUR} />
      <g transform="translate(137 80) rotate(18)">
        <path d="M0 0 C5 -3.5 4.5 -11 0 -15 C-4.5 -11 -5 -3.5 0 0 Z" fill="#c99d4a" stroke="#a67c2e" strokeWidth="1.2" />
        <path d="M0 -1.5 L0 -13" stroke="#a67c2e" strokeWidth="1" opacity="0.7" />
      </g>
    </svg>
  )
}
