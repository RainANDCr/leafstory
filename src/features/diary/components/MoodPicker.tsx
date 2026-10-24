/** 心情选择器：六种心情对应六种叶子颜色，由用户手选 */
import { MOODS, type Mood } from '../types'
import { t } from '@/i18n'

interface MoodPickerProps {
  value: Mood
  onChange: (mood: Mood) => void
}

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <fieldset>
      <legend className="sr-only">{t('diary.fieldMood')}</legend>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((mood) => {
          const active = mood.key === value
          return (
            <button
              key={mood.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(mood.key)}
              className={`flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 text-sm transition-colors ${
                active
                  ? 'border-bark bg-bark text-paper'
                  : 'border-paper-edge bg-card text-bark hover:bg-paper-deep'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border border-bark-deep/20"
                style={{ backgroundColor: mood.color }}
              />
              {mood.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
