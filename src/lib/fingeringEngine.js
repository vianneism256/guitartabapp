import { getNoteOptions, convertToTab, groupNotesByTime } from './tabConverter'

const HAND_SPAN = 4 // fingers comfortably cover 4 frets

// ─── Card 5: Fingerstyle Anchor engine ───────────────────────────────────────

const FINGERS = ['index', 'middle', 'ring', 'pinky']

function groupRawNotesByTime(rawNotes, threshold = 0.25) {
  const sorted = [...rawNotes].sort((a, b) => a.time - b.time)
  const groups = []
  let current = []
  let currentTime = null

  for (const note of sorted) {
    if (currentTime === null || Math.abs(note.time - currentTime) <= threshold) {
      current.push(note)
      currentTime = currentTime ?? note.time
    } else {
      groups.push({ time: currentTime, notes: current })
      current = [note]
      currentTime = note.time
    }
  }
  if (current.length > 0) groups.push({ time: currentTime, notes: current })
  return groups
}

function bassAnchorFret(groupNotes, capoFret) {
  const bassNotes = groupNotes.filter(n => n.midi < 60)
  if (bassNotes.length === 0) return null
  const lowest = [...bassNotes].sort((a, b) => a.midi - b.midi)[0]
  const opts = getNoteOptions(lowest.midi, capoFret).filter(o => ['E', 'A', 'D'].includes(o.string))
  if (opts.length === 0) return null
  return Math.min(...opts.map(o => o.fret))
}

function findBestAnchor(frets) {
  let best = frets[0]
  let bestCount = 0
  for (const candidate of frets) {
    const count = frets.filter(f => f >= candidate && f <= candidate + HAND_SPAN - 1).length
    if (count > bestCount) { bestCount = count; best = candidate }
  }
  return best
}

function computeAnchors(rawGroups, capoFret) {
  const LOOKAHEAD = 4
  const requiredFrets = rawGroups.map(g => bassAnchorFret(g.notes, capoFret))

  let anchor = requiredFrets.find(f => f !== null) ?? capoFret
  return requiredFrets.map((req, i) => {
    if (req !== null) {
      const inWindow = req >= anchor && req <= anchor + HAND_SPAN - 1
      if (!inWindow) {
        const upcoming = requiredFrets.slice(i, i + LOOKAHEAD).filter(f => f !== null)
        anchor = upcoming.length > 0 ? findBestAnchor(upcoming) : req
      }
    }
    return anchor
  })
}

function assignGroupFingers(groupNotes, anchor, capoFret) {
  const occupiedFingers = new Set()
  const usedStrings = new Set()
  const result = []

  const sorted = [...groupNotes].sort((a, b) => {
    const roleA = a.midi < 60 ? 0 : 1
    const roleB = b.midi < 60 ? 0 : 1
    if (roleA !== roleB) return roleA - roleB
    return a.midi - b.midi
  })

  for (const note of sorted) {
    const isBass = note.midi < 60
    const preferStrings = isBass ? ['E', 'A', 'D'] : ['e', 'B', 'G', 'D']

    let options = getNoteOptions(note.midi, capoFret)
    let filtered = options.filter(o => preferStrings.includes(o.string) && !usedStrings.has(o.string))
    if (filtered.length === 0) filtered = options.filter(o => !usedStrings.has(o.string))
    if (filtered.length === 0) filtered = options

    filtered.sort((a, b) => {
      const aOff = Math.max(0, a.fret - anchor)
      const bOff = Math.max(0, b.fret - anchor)
      return aOff - bOff
    })

    let picked = null
    let finger = null

    for (const opt of filtered) {
      const offset = Math.max(0, Math.min(3, opt.fret - anchor))
      const candidateFinger = FINGERS[offset]
      if (!occupiedFingers.has(candidateFinger)) {
        picked = opt
        finger = candidateFinger
        break
      }
    }

    if (!picked) {
      picked = filtered[0] ?? options[0]
      finger = FINGERS.find(f => !occupiedFingers.has(f)) ?? 'pinky'
    }

    occupiedFingers.add(finger)
    usedStrings.add(picked.string)

    result.push({
      ...note,
      string: picked.string,
      fret: picked.fret,
      finger,
      role: isBass ? 'bass' : 'melody',
    })
  }

  return result
}

export function generateFingerstyleAnchorSolution(rawNotes) {
  const capoFret = 0

  const rawGroups = groupRawNotesByTime(rawNotes)
  const anchors = computeAnchors(rawGroups, capoFret)

  let shifts = 0
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i] !== anchors[i - 1]) shifts++
  }
  const score = anchors.length > 1
    ? Math.round((1 - shifts / (anchors.length - 1)) * 100)
    : 100

  const groups = rawGroups.map((group, i) => ({
    time: group.time,
    notes: assignGroupFingers(group.notes, anchors[i], capoFret),
  }))

  const tabNotes = groups.flatMap(g => g.notes)

  return {
    id: 4,
    capoFret,
    handAnchor: anchors[0] ?? 0,
    score,
    label: 'Fingerstyle Anchor',
    tabNotes,
    groups,
    isFingerstyleAnchor: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Idea 3: find the 4-fret window where most notes cluster naturally
export function suggestCapo(rawNotes) {
  // Build a histogram: for each note, count its lowest-fret guitar option
  const fretFreq = new Array(16).fill(0)
  for (const note of rawNotes) {
    const options = getNoteOptions(note.midi)
    if (options.length === 0) continue
    const lowestFret = Math.min(...options.map(o => o.fret))
    fretFreq[lowestFret] = (fretFreq[lowestFret] || 0) + 1
  }

  // Slide a HAND_SPAN window across the fretboard, find the densest cluster
  let bestCapo = 0
  let bestDensity = -1
  for (let capo = 0; capo <= 9; capo++) {
    let density = 0
    for (let f = capo; f < capo + HAND_SPAN; f++) {
      density += fretFreq[f] || 0
    }
    if (density > bestDensity) {
      bestDensity = density
      bestCapo = capo
    }
  }

  return bestCapo
}

// Score a (capoFret, handAnchor) pair: % of notes reachable without shifting
function scorePosition(rawNotes, capoFret, handAnchor) {
  const absAnchor = capoFret + handAnchor
  let reachable = 0
  let total = 0

  for (const note of rawNotes) {
    const options = getNoteOptions(note.midi, capoFret)
    if (options.length === 0) continue
    total++
    const inWindow = options.some(o =>
      o.fret >= absAnchor && o.fret <= absAnchor + HAND_SPAN - 1
    )
    if (inWindow) reachable++
  }

  return total > 0 ? reachable / total : 0
}

function solutionLabel(capoFret, handAnchor) {
  const absPos = capoFret + handAnchor
  if (capoFret === 0 && absPos <= 3) return 'Open Position'
  if (capoFret === 0) return `Position ${absPos + 1}`
  if (handAnchor === 0) return `Capo ${capoFret} — Open Shape`
  return `Capo ${capoFret} — Position ${handAnchor + 1}`
}

const THIN_STRINGS = new Set(['e', 'B', 'G'])

// Like scorePosition but adds a bonus when melody notes land on thin strings
function scoreThinStringPosition(rawNotes, capoFret, handAnchor) {
  const absAnchor = capoFret + handAnchor
  let score = 0
  let total = 0

  for (const note of rawNotes) {
    const options = getNoteOptions(note.midi, capoFret)
    if (options.length === 0) continue
    total++

    const inWindow = options.filter(o =>
      o.fret >= absAnchor && o.fret <= absAnchor + HAND_SPAN - 1
    )
    if (inWindow.length === 0) continue

    // Base point for being reachable
    score += 1

    // Bonus for melody notes that have a thin string option in the window
    const isMelody = note.midi >= 60
    if (isMelody && inWindow.some(o => THIN_STRINGS.has(o.string))) {
      score += 0.6
    }
  }

  // Normalize: max possible score per note is 1.6 (1 base + 0.6 bonus)
  return total > 0 ? score / (total * 1.6) : 0
}

export function generateThinStringSolution(rawNotes, existingSolutions = []) {
  const capoOptions = [0, 1, 2, 3, 4, 5, 6, 7]
  const anchorOptions = [0, 1, 2, 3, 4, 5]

  const candidates = []
  for (const capo of capoOptions) {
    for (const anchor of anchorOptions) {
      const score = scoreThinStringPosition(rawNotes, capo, anchor)
      candidates.push({ capoFret: capo, handAnchor: anchor, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  // Pick the top candidate that isn't already covered by existing solutions
  const best = candidates.find(c =>
    !existingSolutions.some(s =>
      s.capoFret === c.capoFret && Math.abs(s.handAnchor - c.handAnchor) <= 1
    )
  ) ?? candidates[0]

  const tabNotes = convertToTab(rawNotes, best.capoFret, best.handAnchor, true)
  const groups = groupNotesByTime(tabNotes)

  const label = best.capoFret > 0
    ? `Treble Focus — Capo ${best.capoFret}`
    : 'Treble Focus'

  return {
    id: 3,
    capoFret: best.capoFret,
    handAnchor: best.handAnchor,
    score: Math.round(best.score * 100),
    label,
    tabNotes,
    groups,
    isTrebleFocus: true,
  }
}

// Idea 1: try all (capo, anchor) combos, return top 3 diverse solutions
// Each solution includes pre-built groups ready for the visualizer
export function generateSolutions(rawNotes, count = 3) {
  const capoOptions = [0, 1, 2, 3, 4, 5, 6, 7]
  const anchorOptions = [0, 1, 2, 3, 4, 5]

  // Score every candidate
  const candidates = []
  for (const capo of capoOptions) {
    for (const anchor of anchorOptions) {
      const score = scorePosition(rawNotes, capo, anchor)
      candidates.push({ capoFret: capo, handAnchor: anchor, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  // Pick top `count` while ensuring variety (different capo OR anchor gap > 1)
  const picked = []
  for (const c of candidates) {
    if (picked.length >= count) break
    const tooSimilar = picked.some(p =>
      p.capoFret === c.capoFret && Math.abs(p.handAnchor - c.handAnchor) <= 1
    )
    if (!tooSimilar) picked.push(c)
  }

  // Build full tab data for each picked solution
  return picked.map((sol, i) => {
    const tabNotes = convertToTab(rawNotes, sol.capoFret, sol.handAnchor)
    const groups = groupNotesByTime(tabNotes)
    return {
      id: i,
      capoFret: sol.capoFret,
      handAnchor: sol.handAnchor,
      score: Math.round(sol.score * 100),
      label: solutionLabel(sol.capoFret, sol.handAnchor),
      tabNotes,
      groups,
    }
  })
}
