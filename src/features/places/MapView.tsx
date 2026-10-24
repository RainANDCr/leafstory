/**
 * 地图视图：Leaflet + OpenStreetMap 瓦片（可替换）。
 * - 只有用户主动填写过坐标的地点才会上图；
 * - 瓦片加载失败不影响列表视图（地图只是另一种展示）；
 * - 不做自动定位/轨迹；标记点击展示地点卡与可见日记。
 */
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Place } from '@/services/placeService'
import { formatDateShort } from '@/lib/dates'
import { zhCN } from '@/i18n'

interface MapViewProps {
  places: readonly Place[]
}

export function MapView({ places }: MapViewProps) {
  const withCoords = places.filter((p) => p.latitude !== null && p.longitude !== null)
  const center: [number, number] = withCoords.length > 0
    ? [
        withCoords.reduce((s, p) => s + (p.latitude ?? 0), 0) / withCoords.length,
        withCoords.reduce((s, p) => s + (p.longitude ?? 0), 0) / withCoords.length,
      ]
    : [35.5, 105.5] // 默认视野（中国中部），没有足迹时的中性起点

  return (
    <div>
      <div className="overflow-hidden rounded-card border border-paper-edge shadow-soft">
        <MapContainer center={center} zoom={withCoords.length > 0 ? 5 : 4} scrollWheelZoom className="h-72 w-full sm:h-96" attributionControl>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {withCoords.map((place) => (
            <CircleMarker
              key={place.id}
              center={[place.latitude!, place.longitude!]}
              radius={place.isSpecial ? 11 : 8}
              pathOptions={{
                color: place.isSpecial ? '#a67c2e' : '#594638',
                fillColor: place.isSpecial ? '#C99D4A' : '#75816B',
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="min-w-40">
                  <p className="font-semibold">{place.name}</p>
                  {place.isSpecial ? (
                    <p className="text-xs" style={{ color: '#a67c2e' }}>
                      ✦ {zhCN.footprints.specialBadge(place.specialLabel ?? '')}
                    </p>
                  ) : null}
                  <p className="text-xs text-neutral-500">
                    {[place.region, place.happenedOn ? formatDateShort(place.happenedOn) : null].filter(Boolean).join(' · ')}
                  </p>
                  {place.linkedDiaries.length > 0 ? (
                    <div className="mt-1.5">
                      <p className="text-xs text-neutral-500">{zhCN.footprints.linkedDiariesLabel}</p>
                      <ul>
                        {place.linkedDiaries.slice(0, 3).map((d) => (
                          <li key={d.id}>
                            <Link to={`/diary/${d.id}`} className="text-xs underline" style={{ color: '#594638' }}>
                              {d.title || '无题'}（{formatDateShort(d.happenedOn)}）
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="mt-2 text-xs leading-5 text-bark-soft">{zhCN.footprints.mapNote}</p>
      {places.length > withCoords.length ? (
        <p className="mt-1 text-xs text-bark-soft">{zhCN.footprints.noCoordsHint}</p>
      ) : null}
    </div>
  )
}
