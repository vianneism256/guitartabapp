import { useState, useRef, useEffect } from 'react'
import { parseMidi } from '../lib/midiParser'
import { generateSolutions, generateThinStringSolution, generateFingerstyleAnchorSolution } from '../lib/fingeringEngine'
import { exportToAsciiTab, exportToBeatList } from '../lib/tabConverter'
import { loadInstrument, scheduleNotes, stopAll, getCurrentTime } from '../lib/guitarPlayer'
import Fretboard from './Fretboard'

export default function MidiUploader() {
  const [solutions, setSolutions] = useState([])       // 3 fingering solutions
  const [activeSolution, setActiveSolution] = useState(0) // which card is selected
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [bassMax, setBassMax] = useState(59)
  const [showHand, setShowHand] = useState(false)

  const rawNotesRef = useRef([])
  const groupsRef = useRef([])
  const rafRef = useRef(null)
  const playStartRef = useRef(null)

  // Keep groupsRef in sync with the active solution's groups
  useEffect(() => {
    if (solutions[activeSolution]) {
      groupsRef.current = solutions[activeSolution].groups
    }
  }, [solutions, activeSolution])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    handleStop()
    setIsLoading(true)

    const result = await parseMidi(file)
    const allNotes = result.tracks.flatMap(track => track.notes)
    allNotes.sort((a, b) => a.time - b.time)
    rawNotesRef.current = allNotes

    const sols = generateSolutions(allNotes, 3, bassMax)
    const trebleSol = generateThinStringSolution(allNotes, sols, bassMax)
    const fingerstyleSol = generateFingerstyleAnchorSolution(allNotes, bassMax)
    setSolutions([...sols, trebleSol, fingerstyleSol])
    setActiveSolution(0)
    setCurrentIndex(0)
    groupsRef.current = sols[0]?.groups ?? []

    await loadInstrument()
    setIsLoading(false)
  }

  function handleSelectSolution(idx) {
    if (isPlaying) handleStop()
    setActiveSolution(idx)
    setCurrentIndex(0)
  }

  function handlePlay() {
    const groups = groupsRef.current
    if (!groups.length) return

    const songOffset = groups[currentIndex]?.time ?? 0
    const audioStart = scheduleNotes(rawNotesRef.current, songOffset)
    if (audioStart === null) return

    playStartRef.current = { audioStart, songOffset }
    setIsPlaying(true)

    function tick() {
      const elapsed = getCurrentTime() - playStartRef.current.audioStart + playStartRef.current.songOffset
      const g = groupsRef.current

      let idx = currentIndex
      for (let i = 0; i < g.length; i++) {
        if (g[i].time <= elapsed) idx = i
        else break
      }
      setCurrentIndex(idx)

      const lastTime = g[g.length - 1]?.time ?? 0
      if (elapsed < lastTime + 1.5) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setIsPlaying(false)
        setCurrentIndex(0)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  function handlePause() {
    cancelAnimationFrame(rafRef.current)
    stopAll()
    setIsPlaying(false)
  }

  function handleStop() {
    cancelAnimationFrame(rafRef.current)
    stopAll()
    setIsPlaying(false)
    setCurrentIndex(0)
  }

  function prev() {
    if (isPlaying) return
    setCurrentIndex(i => Math.max(0, i - 1))
  }

  function next() {
    if (isPlaying) return
    setCurrentIndex(i => Math.min(groupsRef.current.length - 1, i + 1))
  }

  function downloadTxt(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function solutionSlug(s, i) {
    if (s.isFingerstyleAnchor) return 'fingerstyle'
    if (s.isTrebleFocus) return 'treble-focus'
    return `option-${i + 1}`
  }

  const sol = solutions[activeSolution]
  const currentGroup = sol?.groups[currentIndex]

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', color: '#fff', background: '#111', minHeight: '100vh' }}>
      <h2>Guitar Tab Visualizer</h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="file" accept=".mid,.midi" onChange={handleFile} />
        <label style={{ fontSize: 13, color: '#94a3b8' }}>
          Bass ceiling:{' '}
          <select
            value={bassMax}
            onChange={e => setBassMax(Number(e.target.value))}
            style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 6, padding: '4px 8px', fontFamily: 'monospace', fontSize: 13 }}
          >
            <option value={57}>A3</option>
            <option value={59}>B3 (default)</option>
            <option value={60}>C4</option>
            <option value={61}>C#4</option>
            <option value={62}>D4</option>
            <option value={64}>E4</option>
          </select>
        </label>
      </div>

      {isLoading && (
        <p style={{ color: '#facc15', marginTop: 12 }}>Analyzing fingering & loading guitar sounds...</p>
      )}

      {solutions.length > 0 && !isLoading && (
        <div style={{ marginTop: 30 }}>

          {/* Solution selector cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {solutions.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={() => handleSelectSolution(i)}
                  style={{
                    background: activeSolution === i
                      ? (s.isFingerstyleAnchor ? '#065f46' : s.isTrebleFocus ? '#7c3aed' : '#2563eb')
                      : '#1e293b',
                    border: activeSolution === i
                      ? `2px solid ${s.isFingerstyleAnchor ? '#34d399' : s.isTrebleFocus ? '#c084fc' : '#60a5fa'}`
                      : `2px solid ${s.isFingerstyleAnchor ? '#064e3b' : s.isTrebleFocus ? '#6d28d9' : '#334155'}`,
                    borderRadius: 10,
                    padding: '12px 18px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'monospace',
                    minWidth: 160,
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>
                    {s.isFingerstyleAnchor ? '◆ Fingerstyle' : s.isTrebleFocus ? '✦ Treble Focus' : `Option ${i + 1}`}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 'bold' }}>
                    {s.score}% {s.isFingerstyleAnchor ? 'no-shift' : 'reachable'}
                  </div>
                  {s.capoFret > 0 && (
                    <div style={{ fontSize: 11, color: '#facc15', marginTop: 4 }}>
                      Capo fret {s.capoFret}
                    </div>
                  )}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => downloadTxt(exportToAsciiTab(s), `${solutionSlug(s, i)}-tab.txt`)}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: '#94a3b8',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      padding: '4px 0',
                      cursor: 'pointer',
                    }}
                  >
                    ↓ Tab
                  </button>
                  <button
                    onClick={() => downloadTxt(exportToBeatList(s), `${solutionSlug(s, i)}-beats.txt`)}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: '#94a3b8',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      padding: '4px 0',
                      cursor: 'pointer',
                    }}
                  >
                    ↓ Beats
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Fretboard */}
          {sol && (
            <>
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setShowHand(h => !h)}
                  style={{
                    background: showHand ? '#7c3aed' : '#1e293b',
                    border: `2px solid ${showHand ? '#c084fc' : '#334155'}`,
                    color: '#fff',
                    borderRadius: 8,
                    padding: '6px 16px',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {showHand ? '✋ Hand On' : '✋ Hand Off'}
                </button>
              </div>

              <Fretboard
                activeNotes={currentGroup ? currentGroup.notes : []}
                capoFret={sol.capoFret}
                showHand={showHand}
              />

              {/* Transport */}
              <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                {!isPlaying ? (
                  <button onClick={handlePlay} style={btnStyle('#22c55e')}>▶ Play</button>
                ) : (
                  <button onClick={handlePause} style={btnStyle('#f59e0b')}>⏸ Pause</button>
                )}
                <button onClick={handleStop} style={btnStyle('#ef4444')}>⏹ Stop</button>
              </div>

              {/* Step controls */}
              <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button onClick={prev} disabled={isPlaying || currentIndex === 0}>← Prev</button>
                <span>Beat {currentIndex + 1} of {sol.groups.length}</span>
                <button onClick={next} disabled={isPlaying || currentIndex === sol.groups.length - 1}>Next →</button>
              </div>

              {/* Note list */}
              {currentGroup && (
                <div style={{ marginTop: 16, color: '#aaa' }}>
                  {currentGroup.notes.map((note, i) => (
                    <p key={i}>
                      <strong style={{ color: '#fff' }}>{note.name}</strong> — {note.string} string, fret {note.fret},{' '}
                      <strong style={{ color: '#fff' }}>{note.finger}</strong>
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color) {
  return {
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    fontFamily: 'monospace',
    fontSize: 14,
    cursor: 'pointer',
  }
}
