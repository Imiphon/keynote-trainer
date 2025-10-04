export function detectPitchHz(timeDomain, sampleRate) {
  // Autokorrelation
  const size = timeDomain.length;
  // 1) DC weg & energie prüfen
  let mean = 0;
  for (let i=0;i<size;i++) mean += timeDomain[i];
  mean /= size;
  let rms = 0;
  for (let i=0;i<size;i++) {
    const v = timeDomain[i] - mean;
    timeDomain[i] = v;
    rms += v*v;
  }
  rms = Math.sqrt(rms/size);
  if (rms < 0.0015) return null; // rec sensetivity

  // 2) Autokorrelation
  const maxLag = Math.floor(sampleRate/50);   // ~50 Hz
  const minLag = Math.floor(sampleRate/1000); // ~1000 Hz
  const ac = new Float32Array(maxLag);
  for (let lag=minLag; lag<maxLag; lag++) {
    let sum = 0;
    for (let i=0; i<size-lag; i++) sum += timeDomain[i]*timeDomain[i+lag];
    ac[lag] = sum;
  }

  // 3) Lag des ersten starken Peaks finden
  let bestLag = -1, bestVal = 0;
  for (let lag=minLag+1; lag<maxLag-1; lag++) {
    if (ac[lag] > ac[lag-1] && ac[lag] > ac[lag+1] && ac[lag] > bestVal) {
      bestVal = ac[lag]; bestLag = lag;
    }
  }
  if (bestLag <= 0) return null;

  // Parabolic Interpolation
  const y1 = ac[bestLag-1], y2 = ac[bestLag], y3 = ac[bestLag+1];
  const shift = 0.5 * (y1 - y3) / (y1 - 2*y2 + y3);
  const trueLag = bestLag + (isFinite(shift) ? shift : 0);

  return sampleRate / trueLag;
}

// Hilfen: Notennamen
const A4 = 440;
export function hzToMidi(hz){ return 69 + 12*Math.log2(hz/A4); }
export function midiToNoteName(midi, locale="de") {
  const namesEN = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const namesDE = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","H"];
  const names = locale==="de" ? namesDE : namesEN;
  const n = Math.round(midi);
  const name = names[(n%12+12)%12];
  const octave = Math.floor(n/12)-1;
  const cents = Math.round((midi - n)*100);
  return { name, octave, cents };
}
export function hzToCentClass(hz){
  // 1200-Cent Klasse relativ zu C (MIDI 0)
  const midi = hzToMidi(hz);
  const cents = (midi * 100) % 1200;
  return (cents+1200)%1200;
}
