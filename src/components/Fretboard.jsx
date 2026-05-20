const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']
const FINGER_COLORS = {
  index: '#3B82F6',
  middle: '#22C55E',
  ring: '#A855F7',
  pinky: '#EF4444',
}

const FRET_COUNT = 15
const STRING_SPACING = 40
const FRET_SPACING = 60
const PADDING = 60

const SKIN = '#D4956A'
const SKIN_SHADOW = '#A87050'
const SKIN_LIGHT = '#EAB88A'
const NAIL_COLOR = '#F5E8D5'
const NAIL_STROKE = '#C8A070'

const PALM_OFFSETS = { index: -45, middle: -15, ring: 15, pinky: 45 }
const FINGER_ORDER = ['index', 'middle', 'ring', 'pinky']

function bPoint(t, x0, y0, x1, y1, x2, y2) {
  const m = 1 - t
  return { x: m*m*x0 + 2*m*t*x1 + t*t*x2, y: m*m*y0 + 2*m*t*y1 + t*t*y2 }
}

function bTangent(t, x0, y0, x1, y1, x2, y2) {
  const m = 1 - t
  return { x: 2*m*(x1-x0) + 2*t*(x2-x1), y: 2*m*(y1-y0) + 2*t*(y2-y1) }
}

export default function Fretboard({ activeNotes = [], capoFret = 0, showHand = false }) {
  const HAND_EXTRA = showHand ? 160 : 0
  const width = FRET_COUNT * FRET_SPACING + PADDING * 2
  const height = 6 * STRING_SPACING + PADDING * 2 + HAND_EXTRA

  const fingerPositions = activeNotes
    .filter(n => FINGER_ORDER.includes(n.finger))
    .map(note => {
      const si = STRING_NAMES.indexOf(note.string)
      if (si === -1 || note.fret === undefined) return null
      const cx = note.fret === 0 ? PADDING - 15 : PADDING + note.fret * FRET_SPACING - FRET_SPACING / 2
      const cy = PADDING + si * STRING_SPACING
      return { finger: note.finger, cx, cy }
    })
    .filter(Boolean)

  const avgX = fingerPositions.length > 0
    ? fingerPositions.reduce((s, p) => s + p.cx, 0) / fingerPositions.length
    : width / 2

  const palmY = PADDING + 5 * STRING_SPACING + 85

  return (
    <svg width={width} height={height} style={{ background: '#1a1a1a', borderRadius: 12 }}>

      {/* Fret numbers */}
      {Array.from({ length: FRET_COUNT + 1 }, (_, i) => (
        <text key={i} x={PADDING + i * FRET_SPACING} y={PADDING - 10} fill="#888" fontSize={12} textAnchor="middle">
          {i}
        </text>
      ))}

      {/* Strings */}
      {STRING_NAMES.map((name, i) => (
        <g key={name}>
          <line
            x1={PADDING} y1={PADDING + i * STRING_SPACING}
            x2={PADDING + FRET_COUNT * FRET_SPACING} y2={PADDING + i * STRING_SPACING}
            stroke="#555" strokeWidth={i < 3 ? 1.5 : 2.5}
          />
          <text x={PADDING - 20} y={PADDING + i * STRING_SPACING + 5} fill="#aaa" fontSize={13} textAnchor="middle">
            {name}
          </text>
        </g>
      ))}

      {/* Fret lines */}
      {Array.from({ length: FRET_COUNT + 1 }, (_, i) => (
        <line
          key={i}
          x1={PADDING + i * FRET_SPACING} y1={PADDING}
          x2={PADDING + i * FRET_SPACING} y2={PADDING + 5 * STRING_SPACING}
          stroke={i === 0 ? '#fff' : '#444'} strokeWidth={i === 0 ? 3 : 1}
        />
      ))}

      {/* Fret markers */}
      {[3, 5, 7, 9, 12].map(fret => (
        <circle
          key={fret}
          cx={PADDING + fret * FRET_SPACING - FRET_SPACING / 2}
          cy={PADDING + 2.5 * STRING_SPACING}
          r={5} fill="#333"
        />
      ))}

      {/* Capo marker */}
      {capoFret > 0 && (
        <g>
          <rect
            x={PADDING + capoFret * FRET_SPACING - 7} y={PADDING - 4}
            width={14} height={5 * STRING_SPACING + 8}
            rx={6} fill="#facc15" opacity={0.85}
          />
          <text
            x={PADDING + capoFret * FRET_SPACING} y={PADDING + 5 * STRING_SPACING + 24}
            fill="#facc15" fontSize={11} textAnchor="middle" fontWeight="bold"
          >
            CAPO {capoFret}
          </text>
        </g>
      )}

      {/* Finger dot circles — shown when hand overlay is off */}
      {!showHand && activeNotes.map((note, i) => {
        const stringIndex = STRING_NAMES.indexOf(note.string)
        if (stringIndex === -1 || note.fret === undefined) return null
        const cx = note.fret === 0 ? PADDING - 15 : PADDING + note.fret * FRET_SPACING - FRET_SPACING / 2
        const cy = PADDING + stringIndex * STRING_SPACING
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={16} fill={FINGER_COLORS[note.finger] || '#fff'} opacity={0.9} />
            <text x={cx} y={cy + 5} fill="#fff" fontSize={11} textAnchor="middle" fontWeight="bold">
              {note.finger === 'index' ? '1' : note.finger === 'middle' ? '2' : note.finger === 'ring' ? '3' : '4'}
            </text>
          </g>
        )
      })}

      {/* Hand overlay */}
      {showHand && fingerPositions.length > 0 && (
        <g opacity={0.94}>

          {/* Palm body */}
          <ellipse cx={avgX} cy={palmY + 38} rx={76} ry={44}
            fill={SKIN} stroke={SKIN_SHADOW} strokeWidth={1.5} />
          {/* Palm highlight */}
          <ellipse cx={avgX - 12} cy={palmY + 22} rx={42} ry={22}
            fill={SKIN_LIGHT} opacity={0.28} />

          {/* Thumb */}
          <ellipse
            cx={avgX - 92} cy={palmY + 18} rx={13} ry={26}
            fill={SKIN} stroke={SKIN_SHADOW} strokeWidth={1.5}
            transform={`rotate(-28, ${avgX - 92}, ${palmY + 18})`}
          />
          {/* Thumb knuckle */}
          <line
            x1={avgX - 97} y1={palmY + 4}
            x2={avgX - 85} y2={palmY + 2}
            stroke={SKIN_SHADOW} strokeWidth={1.5} strokeLinecap="round" opacity={0.6}
          />
          {/* Thumb nail */}
          <ellipse
            cx={avgX - 100} cy={palmY - 4} rx={5} ry={3.5}
            fill={NAIL_COLOR} stroke={NAIL_STROKE} strokeWidth={0.8}
            transform={`rotate(-28, ${avgX - 100}, ${palmY - 4})`}
          />

          {/* Fingers */}
          {fingerPositions.map(({ finger, cx, cy }) => {
            const attachX = avgX + PALM_OFFSETS[finger]
            const attachY = palmY + 8
            const ctrlX = (attachX + cx) / 2
            const ctrlY = Math.min(cy, attachY) - 55

            const k1 = bPoint(0.28, attachX, attachY, ctrlX, ctrlY, cx, cy)
            const k1t = bTangent(0.28, attachX, attachY, ctrlX, ctrlY, cx, cy)
            const k1l = Math.sqrt(k1t.x**2 + k1t.y**2)
            const k1n = { x: -k1t.y / k1l * 9, y: k1t.x / k1l * 9 }

            const k2 = bPoint(0.6, attachX, attachY, ctrlX, ctrlY, cx, cy)
            const k2t = bTangent(0.6, attachX, attachY, ctrlX, ctrlY, cx, cy)
            const k2l = Math.sqrt(k2t.x**2 + k2t.y**2)
            const k2n = { x: -k2t.y / k2l * 7, y: k2t.x / k2l * 7 }

            const tipT = bTangent(1, attachX, attachY, ctrlX, ctrlY, cx, cy)
            const tipL = Math.sqrt(tipT.x**2 + tipT.y**2)
            const tipN = { x: -tipT.y / tipL, y: tipT.x / tipL }
            const nailAngle = Math.atan2(tipT.y, tipT.x) * 180 / Math.PI
            const nailCx = cx + tipN.x * 6
            const nailCy = cy + tipN.y * 6

            return (
              <g key={finger}>
                {/* Drop shadow */}
                <path
                  d={`M ${attachX} ${attachY} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`}
                  stroke={SKIN_SHADOW} strokeWidth={26} strokeLinecap="round" fill="none" opacity={0.28}
                />
                {/* Finger body */}
                <path
                  d={`M ${attachX} ${attachY} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`}
                  stroke={SKIN} strokeWidth={20} strokeLinecap="round" fill="none"
                />
                {/* Highlight stripe */}
                <path
                  d={`M ${attachX} ${attachY} Q ${ctrlX} ${ctrlY} ${cx} ${cy}`}
                  stroke={SKIN_LIGHT} strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.4}
                />

                {/* Knuckle 1 */}
                <line
                  x1={k1.x - k1n.x} y1={k1.y - k1n.y}
                  x2={k1.x + k1n.x} y2={k1.y + k1n.y}
                  stroke={SKIN_SHADOW} strokeWidth={1.5} strokeLinecap="round" opacity={0.65}
                />
                <line
                  x1={k1.x - k1n.x * 0.55 + 1.5} y1={k1.y - k1n.y * 0.55 + 1.5}
                  x2={k1.x + k1n.x * 0.55 + 1.5} y2={k1.y + k1n.y * 0.55 + 1.5}
                  stroke={SKIN_SHADOW} strokeWidth={1} strokeLinecap="round" opacity={0.22}
                />

                {/* Knuckle 2 */}
                <line
                  x1={k2.x - k2n.x} y1={k2.y - k2n.y}
                  x2={k2.x + k2n.x} y2={k2.y + k2n.y}
                  stroke={SKIN_SHADOW} strokeWidth={1.5} strokeLinecap="round" opacity={0.65}
                />

                {/* Fingertip pad */}
                <circle cx={cx} cy={cy} r={11} fill={SKIN} stroke={SKIN_SHADOW} strokeWidth={1} />
                <circle cx={cx - 3} cy={cy - 3} r={5} fill={SKIN_LIGHT} opacity={0.32} />

                {/* Fingernail */}
                <ellipse
                  cx={nailCx} cy={nailCy} rx={6.5} ry={4}
                  fill={NAIL_COLOR} stroke={NAIL_STROKE} strokeWidth={0.8}
                  transform={`rotate(${nailAngle}, ${nailCx}, ${nailCy})`}
                />
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}
