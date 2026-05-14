import { getNoteOptions, convertToTab, groupNotesByTime } from './tabConverter'

const HAND_SPAN = 4 // fingers comfortably cover 4 frets

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
