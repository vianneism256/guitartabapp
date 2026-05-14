import Soundfont from 'soundfont-player'

let audioCtx = null
let instrument = null
let scheduledNodes = []

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

export async function loadInstrument() {
  const ac = getAudioCtx()
  instrument = await Soundfont.instrument(ac, 'acoustic_guitar_nylon', {
    soundfont: 'MusyngKite',
  })
  return instrument
}

// rawNotes: all original MIDI notes (for audio — nothing filtered out)
// fromTime: song offset in seconds to start from
export function scheduleNotes(rawNotes, fromTime = 0) {
  if (!instrument) return null
  const ac = getAudioCtx()
  if (ac.state === 'suspended') ac.resume()

  stopAll()

  const now = ac.currentTime
  scheduledNodes = []

  for (const note of rawNotes) {
    if (note.time < fromTime) continue
    const when = now + (note.time - fromTime)
    const duration = Math.max(note.duration ?? 0.3, 0.25)
    // bass notes (below C4) get a slight volume boost
    const gain = note.midi < 60 ? 1.3 : 1.0
    const node = instrument.play(note.midi, when, { duration, gain })
    if (node) scheduledNodes.push(node)
  }

  return now
}

export function stopAll() {
  for (const node of scheduledNodes) {
    try { node.stop() } catch (_) {}
  }
  scheduledNodes = []
}

export function getCurrentTime() {
  return audioCtx?.currentTime ?? 0
}
