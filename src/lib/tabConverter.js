// Standard guitar strings, each value is the MIDI note of the open string
export const STRING_MIDI = {
  e: 64, // high e
  B: 59,
  G: 55,
  D: 50,
  A: 45,
  E: 40, // low E
}

const STRINGS = ['e', 'B', 'G', 'D', 'A', 'E']

export function splitTracks(notes) {
  const bass = notes.filter(n => n.midi < 60)
  const melody = notes.filter(n => n.midi >= 60)
  return { bass, melody }
}

// Find all string+fret options for a given MIDI note, optionally above a capo
export function getNoteOptions(midiNote, capoFret = 0) {
  const options = []
  for (const string of STRINGS) {
    const openMidi = STRING_MIDI[string]
    const fret = midiNote - openMidi
    if (fret >= capoFret && fret <= 15) {
      options.push({ string, fret })
    }
  }
  return options
}

function bestOption(options, currentFret, preferStrings = null) {
  let filtered = options
  if (preferStrings) {
    filtered = options.filter(o => preferStrings.includes(o.string))
    if (filtered.length === 0) filtered = options
  }
  return filtered.sort((a, b) =>
    Math.abs(a.fret - currentFret) - Math.abs(b.fret - currentFret)
  )[0]
}

// capoFret: absolute fret where capo is placed (notes below this are unreachable)
// handAnchor: fret position relative to capo where index finger sits (0 = at the capo)
// thinStringBias: when true, melody notes strongly prefer e, B, G strings
export function convertToTab(notes, capoFret = 0, handAnchor = 0, thinStringBias = false) {
  const { bass, melody } = splitTracks(notes)

  const allNotes = [
    ...bass.map(n => ({ ...n, role: 'bass' })),
    ...melody.map(n => ({ ...n, role: 'melody' })),
  ].sort((a, b) => a.time - b.time)

  // Absolute fret the index finger starts at
  let handPosition = capoFret + handAnchor
  const tabNotes = []

  for (const note of allNotes) {
    const options = getNoteOptions(note.midi, capoFret)
    if (options.length === 0) continue

    const preferStrings = note.role === 'bass'
      ? ['E', 'A', 'D']
      : thinStringBias ? ['e', 'B', 'G'] : ['e', 'B', 'G', 'D']

    const picked = bestOption(options, handPosition, preferStrings)

    if (Math.abs(picked.fret - handPosition) > 3) {
      handPosition = picked.fret
    }

    tabNotes.push({
      ...note,
      string: picked.string,
      fret: picked.fret,
      finger: note.role === 'bass' ? 'thumb' : assignFinger(picked.fret, handPosition),
    })
  }

  return tabNotes
}

export function groupNotesByTime(tabNotes, threshold = 0.25) {
  const groups = []
  let currentGroup = []
  let currentTime = null

  for (const note of tabNotes) {
    if (currentTime === null || Math.abs(note.time - currentTime) <= threshold) {
      currentGroup.push(note)
      currentTime = currentTime ?? note.time
    } else {
      groups.push({ time: currentTime, notes: resolveStringConflicts(currentGroup) })
      currentGroup = [note]
      currentTime = note.time
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ time: currentTime, notes: resolveStringConflicts(currentGroup) })
  }

  return groups
}

function resolveStringConflicts(notes) {
  const usedStrings = new Set()
  return notes.map(note => {
    if (!usedStrings.has(note.string)) {
      usedStrings.add(note.string)
      return note
    }
    const options = getNoteOptions(note.midi).filter(o => !usedStrings.has(o.string))
    if (options.length === 0) return note
    const alt = options[0]
    usedStrings.add(alt.string)
    return { ...note, string: alt.string, fret: alt.fret }
  })
}

function assignFinger(fret, anchor) {
  const offset = fret - anchor
  if (offset <= 0) return 'index'
  if (offset === 1) return 'middle'
  if (offset === 2) return 'ring'
  return 'pinky'
}
