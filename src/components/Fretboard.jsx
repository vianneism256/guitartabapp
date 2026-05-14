const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E']
const FINGER_COLORS = {
  thumb: '#F59E0B',   // amber
  index: '#3B82F6',   // blue
  middle: '#22C55E',  // green
  ring: '#A855F7',    // purple
  pinky: '#EF4444',   // red
}

const FRET_COUNT = 15
const STRING_SPACING = 40
const FRET_SPACING = 60
const PADDING = 60

export default function Fretboard({ activeNotes = [], capoFret = 0 }) {
  const width = FRET_COUNT * FRET_SPACING + PADDING * 2
  const height = 6 * STRING_SPACING + PADDING * 2

  return (
    <svg width={width} height={height} style={{ background: '#1a1a1a', borderRadius: 12 }}>
      {/* Fret numbers */}
      {Array.from({ length: FRET_COUNT + 1 }, (_, i) => (
        <text
          key={i}
          x={PADDING + i * FRET_SPACING}
          y={PADDING - 10}
          fill="#888"
          fontSize={12}
          textAnchor="middle"
        >
          {i}
        </text>
      ))}

      {/* Strings */}
      {STRING_NAMES.map((name, i) => (
        <g key={name}>
          <line
            x1={PADDING}
            y1={PADDING + i * STRING_SPACING}
            x2={PADDING + FRET_COUNT * FRET_SPACING}
            y2={PADDING + i * STRING_SPACING}
            stroke="#555"
            strokeWidth={i < 3 ? 1.5 : 2.5}
          />
          {/* String name label */}
          <text
            x={PADDING - 20}
            y={PADDING + i * STRING_SPACING + 5}
            fill="#aaa"
            fontSize={13}
            textAnchor="middle"
          >
            {name}
          </text>
        </g>
      ))}

      {/* Fret lines */}
      {Array.from({ length: FRET_COUNT + 1 }, (_, i) => (
        <line
          key={i}
          x1={PADDING + i * FRET_SPACING}
          y1={PADDING}
          x2={PADDING + i * FRET_SPACING}
          y2={PADDING + 5 * STRING_SPACING}
          stroke={i === 0 ? '#fff' : '#444'}
          strokeWidth={i === 0 ? 3 : 1}
        />
      ))}

      {/* Fret markers (dots at 3, 5, 7, 9, 12) */}
      {[3, 5, 7, 9, 12].map(fret => (
        <circle
          key={fret}
          cx={PADDING + fret * FRET_SPACING - FRET_SPACING / 2}
          cy={PADDING + 2.5 * STRING_SPACING}
          r={5}
          fill="#333"
        />
      ))}

      {/* Capo marker */}
      {capoFret > 0 && (
        <g>
          <rect
            x={PADDING + capoFret * FRET_SPACING - 7}
            y={PADDING - 4}
            width={14}
            height={5 * STRING_SPACING + 8}
            rx={6}
            fill="#facc15"
            opacity={0.85}
          />
          <text
            x={PADDING + capoFret * FRET_SPACING}
            y={PADDING + 5 * STRING_SPACING + 24}
            fill="#facc15"
            fontSize={11}
            textAnchor="middle"
            fontWeight="bold"
          >
            CAPO {capoFret}
          </text>
        </g>
      )}

      {/* Active note circles */}
      {activeNotes.map((note, i) => {
        const stringIndex = STRING_NAMES.indexOf(note.string)
        if (stringIndex === -1 || note.fret === undefined) return null

        const cx = note.fret === 0
          ? PADDING - 15
          : PADDING + note.fret * FRET_SPACING - FRET_SPACING / 2
        const cy = PADDING + stringIndex * STRING_SPACING

        return (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r={16}
              fill={FINGER_COLORS[note.finger] || '#fff'}
              opacity={0.9}
            />
            <text
              x={cx}
              y={cy + 5}
              fill="#fff"
              fontSize={11}
              textAnchor="middle"
              fontWeight="bold"
            >
              {note.finger === 'thumb' ? 'T' :
               note.finger === 'index' ? '1' :
               note.finger === 'middle' ? '2' :
               note.finger === 'ring' ? '3' : '4'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}