import { Midi } from '@tonejs/midi'

export async function parseMidi(file) {
  const arrayBuffer = await file.arrayBuffer()
  const midi = new Midi(arrayBuffer)

  console.log('=== MIDI INFO ===')
  console.log('BPM:', midi.header.tempos[0]?.bpm)
  console.log('Time Signature:', midi.header.timeSignatures[0]?.timeSignature)
  console.log('Total Tracks:', midi.tracks.length)

  const tracks = midi.tracks.map((track, index) => {
    console.log(`--- Track ${index} ---`)
    console.log('Name:', track.name)
    console.log('Notes:', track.notes.length)
    console.log('First few notes:', track.notes.slice(0, 5).map(n => ({
      name: n.name,
      midi: n.midi,
      time: n.time,
      duration: n.duration,
    })))

    return {
      index,
      name: track.name || `Track ${index}`,
      noteCount: track.notes.length,
      notes: track.notes.map(n => ({
        name: n.name,       // e.g. "C4"
        midi: n.midi,       // e.g. 60
        time: n.time,       // in seconds
        duration: n.duration,
        velocity: n.velocity,
      }))
    }
  })

  return {
    bpm: midi.header.tempos[0]?.bpm ?? 120,
    timeSignature: midi.header.timeSignatures[0]?.timeSignature ?? [4, 4],
    durationSeconds: midi.duration,
    tracks,
  }
}