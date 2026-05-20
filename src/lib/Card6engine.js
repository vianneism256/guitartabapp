// ─── Card 6: Refined Fingerstyle Engine ──────────────────────────────────────
//
// Improvements over Card 5 (Fingerstyle Anchor):
//   1. Capo is detected via suggestCapo instead of hardcoded to 0
//   2. Right hand PIMA plucking fingers properly assigned per string
//   3. Open strings are strongly preferred over fretted positions
//   4. Hand span is dynamic — widens higher up the neck (frets get closer)
//   5. Anchor computation is smoother with look-ahead planning
//   6. Barre chords detected and labeled when 2+ notes share a fret
//   7. Repeated melody notes alternate plucking fingers (m/a)
//   8. Left hand finger accounts for barre (index is reserved for barre fret)
//   9. Score is multi-dimensional: reachability + smoothness + open string usage
//  10. Bass/melody role separation is respected throughout the whole pipeline
//
// Import this in App.jsx (or wherever solutions are assembled) and add it
// as the 6th card alongside the existing 5.
// ─────────────────────────────────────────────────────────────────────────────

import { getNoteOptions, groupNotesByTime } from './tabConverter'
import { suggestCapo } from './fingeringEngine'

// ─── Constants ───────────────────────────────────────────────────────────────

const FRET_FINGERS = ['index', 'middle', 'ring', 'pinky']
const LOOKAHEAD    = 4   // groups to look ahead when repositioning anchor
const BASE_BASS_MAX = 59 // MIDI 59 = B3, default bass/melody split

// ─── Right hand (plucking) ───────────────────────────────────────────────────
// Standard fingerstyle PIMA convention:
//   p (pulgar / thumb)   → bass strings: E A D
//   i (index)            → G string
//   m (middle)           → B string
//   a (annular / ring)   → e string

function rightHandFinger(string) {
  switch (string) {
    case 'E': case 'A': case 'D': return 'p'
    case 'G': return 'i'
    case 'B': return 'm'
    case 'e': return 'a'
    default:  return 'i'
  }
}

// For melody strings, alternate m/a on repeated hits of the same string
// to avoid the "rest stroke trap" — plucking the same finger twice in a row
// is slow and tiring. Standard technique alternates i/m or m/a.
function adaptivePluckFinger(string, pluckHistory) {
  if (string === 'e' || string === 'B' || string === 'G') {
    const last = pluckHistory[string]
    if (last === 'm') return 'a'
    if (last === 'a') return 'm'
  }
  return rightHandFinger(string)
}

// ─── Dynamic hand span ───────────────────────────────────────────────────────
// Near the nut the frets are wide and stretching 4 frets is genuinely hard.
// Higher up the neck frets are closer together so 5-fret spans are comfortable.

function handSpan(anchorFret) {
  if (anchorFret <= 2)  return 3  // open/low position — frets widest
  if (anchorFret <= 7)  return 4  // mid neck — standard
  return 5                         // upper neck — frets close, stretch easier
}

// ─── Note grouping ───────────────────────────────────────────────────────────

function groupByTime(rawNotes, threshold = 0.25) {
  const sorted = [...rawNotes].sort((a, b) => a.time - b.time)
  const groups = []
  let current     = []
  let currentTime = null

  for (const note of sorted) {
    if (currentTime === null || Math.abs(note.time - currentTime) <= threshold) {
      current.push(note)
      currentTime = currentTime ?? note.time
    } else {
      groups.push({ time: currentTime, notes: current })
      current     = [note]
      currentTime = note.time
    }
  }
  if (current.length > 0) groups.push({ time: currentTime, notes: current })
  return groups
}

// ─── Anchor computation ───────────────────────────────────────────────────────
// For each group find the lowest non-open fret required. Then slide a
// dynamic-span window across those frets using look-ahead to minimise shifts.

function minNonOpenFret(notes, capoFret) {
  const frets = notes.flatMap(n => {
    const opts = getNoteOptions(n.midi, capoFret).filter(o => o.fret > 0)
    return opts.map(o => o.fret)
  })
  return frets.length > 0 ? Math.min(...frets) : null
}

function bestAnchorForFrets(frets, span) {
  if (frets.length === 0) return 0
  let best = frets[0], bestCount = 0
  for (const candidate of frets) {
    const count = frets.filter(f => f >= candidate && f <= candidate + span - 1).length
    if (count > bestCount) { bestCount = count; best = candidate }
  }
  return best
}

function computeAnchors(groups, capoFret) {
  const requiredFrets = groups.map(g => minNonOpenFret(g.notes, capoFret))

  let anchor = requiredFrets.find(f => f !== null) ?? capoFret
  const anchors = []

  for (let i = 0; i < requiredFrets.length; i++) {
    const req  = requiredFrets[i]
    const span = handSpan(anchor)

    if (req !== null) {
      const inWindow = req >= anchor && req <= anchor + span - 1
      if (!inWindow) {
        // Pull upcoming required frets to find the best repositioning point
        const upcoming = requiredFrets
          .slice(i, i + LOOKAHEAD)
          .filter(f => f !== null)
        anchor = upcoming.length > 0
          ? bestAnchorForFrets(upcoming, handSpan(upcoming[0]))
          : req
      }
    }
    anchors.push(anchor)
  }

  return anchors
}

// ─── Barre detection ─────────────────────────────────────────────────────────
// If 2+ notes in the same group land on the same non-open fret,
// flag it as a barre chord — index finger covers the whole fret.

function detectBarre(assignedNotes) {
  const counts = {}
  for (const n of assignedNotes) {
    if (n.fret === 0) continue
    counts[n.fret] = (counts[n.fret] || 0) + 1
  }
  const entry = Object.entries(counts).find(([, c]) => c >= 2)
  return entry ? parseInt(entry[0]) : null
}

// ─── Left hand finger assignment ─────────────────────────────────────────────
// Maps fret → fretting finger relative to the current anchor.
// When a barre is active, index is locked to the barre fret;
// notes above it shift to middle/ring/pinky.

function leftHandFinger(fret, anchor, barreFret) {
  if (fret === 0) return 'open'
  if (barreFret !== null && fret === barreFret) return 'index'

  // If barre exists, index is taken — shift offset by 1
  const baseOffset = barreFret !== null ? 1 : 0
  const offset     = Math.max(baseOffset, Math.min(3, fret - anchor))
  return FRET_FINGERS[offset]
}

// ─── String / fret selection ──────────────────────────────────────────────────
// For each note in a group:
//   1. Filter to preferred strings (bass → E A D, melody → e B G)
//   2. Fall back to any unused string if needed
//   3. Sort: open strings first, then by proximity to anchor window

function pickOption(midi, capoFret, preferStrings, usedStrings, anchor) {
  const allOpts = getNoteOptions(midi, capoFret)
  const span    = handSpan(anchor)

  let pool = allOpts.filter(o => preferStrings.includes(o.string) && !usedStrings.has(o.string))
  if (pool.length === 0) pool = allOpts.filter(o => !usedStrings.has(o.string))
  if (pool.length === 0) pool = allOpts

  pool.sort((a, b) => {
    // Open string is almost always the right choice when available
    if (a.fret === 0 && b.fret !== 0) return -1
    if (b.fret === 0 && a.fret !== 0) return 1

    // Within-window options beat out-of-window ones
    const aIn = a.fret >= anchor && a.fret <= anchor + span - 1
    const bIn = b.fret >= anchor && b.fret <= anchor + span - 1
    if (aIn && !bIn) return -1
    if (bIn && !aIn) return 1

    // Closest to anchor wins ties
    return Math.abs(a.fret - anchor) - Math.abs(b.fret - anchor)
  })

  return pool[0] ?? allOpts[0]
}

// ─── Group assignment ─────────────────────────────────────────────────────────
// Full pipeline per beat group: pick string/fret → detect barre → assign fingers

function assignGroup(groupNotes, anchor, capoFret, bassMax, pluckHistory) {
  const usedStrings = new Set()

  // Sort: bass notes first (they anchor the hand), then melody low to high
  const sorted = [...groupNotes].sort((a, b) => {
    const ra = a.midi <= bassMax ? 0 : 1
    const rb = b.midi <= bassMax ? 0 : 1
    return ra !== rb ? ra - rb : a.midi - b.midi
  })

  // Pass 1 — string/fret selection
  const withPositions = sorted.map(note => {
    const isBass       = note.midi <= bassMax
    const preferStrings = isBass ? ['E', 'A', 'D'] : ['e', 'B', 'G']
    const picked        = pickOption(note.midi, capoFret, preferStrings, usedStrings, anchor)

    usedStrings.add(picked.string)
    return { ...note, string: picked.string, fret: picked.fret, role: isBass ? 'bass' : 'melody' }
  })

  // Pass 2 — detect barre across assigned positions
  const barreFret = detectBarre(withPositions)

  // Pass 3 — assign both hands
  const result = withPositions.map(note => {
    // Right hand: use alternation history for melody strings
    const pluck = adaptivePluckFinger(note.string, pluckHistory)
    pluckHistory[note.string] = pluck   // update history

    // Left hand: open / barre-aware / offset-based
    const fretFinger = leftHandFinger(note.fret, anchor, barreFret)

    return {
      ...note,
      finger:      fretFinger, // left hand (fretting)
      pluckFinger: pluck,      // right hand (PIMA)
      isBarre:     barreFret !== null && note.fret === barreFret,
    }
  })

  return { notes: result, barreFret }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Three dimensions weighted together:
//   Reachability  55% — are notes within the hand window?
//   Smoothness    35% — how rarely does the anchor shift?
//   Open strings  10% — bonus for using open strings (natural guitar resonance)

function scoreResult(anchors, assignedGroups) {
  const n = anchors.length
  if (n === 0) return 0

  // Smoothness
  let shifts = 0
  for (let i = 1; i < n; i++) {
    if (anchors[i] !== anchors[i - 1]) shifts++
  }
  const smoothness = 1 - shifts / Math.max(1, n - 1)

  // Reachability + open string count
  let reachable = 0, openCount = 0, total = 0
  for (let i = 0; i < assignedGroups.length; i++) {
    const anchor = anchors[i]
    const span   = handSpan(anchor)
    for (const note of assignedGroups[i].notes) {
      total++
      if (note.fret === 0) {
        reachable++   // open string is always reachable
        openCount++
      } else if (note.fret >= anchor && note.fret <= anchor + span - 1) {
        reachable++
      }
    }
  }

  const reachability = total > 0 ? reachable  / total : 1
  const openBonus    = total > 0 ? openCount  / total : 0

  return reachability * 0.55 + smoothness * 0.35 + openBonus * 0.10
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateRefinedFingerstyle(rawNotes, bassMax = BASE_BASS_MAX) {
  // 1. Detect capo properly (no more hardcoded 0)
  const capoFret = suggestCapo(rawNotes)

  // 2. Group notes by time
  const rawGroups = groupByTime(rawNotes)

  // 3. Compute smoothed anchors with look-ahead + dynamic span
  const anchors = computeAnchors(rawGroups, capoFret)

  // 4. Assign fingers group by group
  // pluckHistory persists across groups so alternation works across beats
  const pluckHistory = {}

  const groups = rawGroups.map((group, i) => {
    const { notes, barreFret } = assignGroup(
      group.notes,
      anchors[i],
      capoFret,
      bassMax,
      pluckHistory,
    )
    return { time: group.time, notes, barreFret }
  })

  // 5. Compute multi-dimensional score
  const score = scoreResult(anchors, groups)

  // 6. Build flat tabNotes array for the visualizer
  const tabNotes = groups.flatMap(g => g.notes)

  // 7. Build a human-readable label
  const label = capoFret > 0
    ? `Refined Fingerstyle — Capo ${capoFret}`
    : 'Refined Fingerstyle'

  return {
    id:                 5,           // Card 6 (0-indexed)
    capoFret,
    handAnchor:         anchors[0] ?? 0,
    score:              Math.round(score * 100),
    label,
    tabNotes,
    groups,
    isRefinedFingerstyle: true,
  }
}