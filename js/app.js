import { detectPitchHz, hzToMidi, midiToNoteName, hzToCentClass } from "./pitch.js";
import { madFilter, circularMeanCents } from "./stats.js";

let audioCtx, analyser, source, rafId;
let buf, timeData;
let collecting = false;
const samplesHz = []; // Rohwerte der aktuellen Aufnahme

const els = {
  start: document.getElementById("btn-start"),
  stop: document.getElementById("btn-stop"),
  save: document.getElementById("btn-save"),
  clear: document.getElementById("btn-clear"),
  status: document.getElementById("status"),
  curHz: document.getElementById("cur-hz"),
  curNote: document.getElementById("cur-note"),
  curStab: document.getElementById("cur-stab"),
  resNote: document.getElementById("result-note"),
  resDetail: document.getElementById("result-detail"),
  sessionList: document.getElementById("session-list"),
};

els.start.addEventListener("click", start);
els.stop.addEventListener("click", stop);
els.save.addEventListener("click", saveSession);
els.clear.addEventListener("click", clearAll);

const DBKEY = "grundton-data-v1";
const store = loadStore();

renderSessions();
updateAggregate();

async function start(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    els.status.textContent = window.isSecureContext === false
      ? "Chrome blockt das Mikrofon, weil die Seite nicht über HTTPS/localhost läuft. Bitte über https:// oder http://localhost aufrufen."
      : "Der Browser stellt keine getUserMedia-API bereit.";
    return;
  }
  try{
    els.start.disabled = true; els.stop.disabled = false;
    els.status.textContent = "🎙️ Aufnahme läuft… halte einen angenehmen Ton.";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:true }});
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    timeData = new Float32Array(analyser.fftSize);
    collecting = true;
    samplesHz.length = 0;
    loop();
  }catch(e){
    let msg = "Mikrofon-Zugriff abgelehnt.";
    if (window.isSecureContext === false){
      msg = "Chrome blockt das Mikrofon, weil die Seite nicht über HTTPS/localhost läuft. Bitte über https:// oder http://localhost aufrufen.";
    } else if (e.name === "NotAllowedError"){ // Benutzer oder Browser blockt den Zugriff
      msg = "Chrome hat den Zugriff verweigert. Bitte in den Website-Einstellungen das Mikrofon freigeben.";
    } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError"){ // kein passendes Gerät
      msg = "Kein Mikrofon gefunden oder es ist exklusiv belegt.";
    }
    els.status.textContent = msg;
    els.start.disabled = false;
    console.error(e);
  }
}
function stop(){
  collecting = false;
  els.stop.disabled = true; els.start.disabled = false;
  cancelAnimationFrame(rafId);
  els.status.textContent = "Aufnahme gestoppt.";
  // Stabilitätsanalyse der Session
  const stable = smoothAndSelectStable(samplesHz);
  els.save.disabled = stable.length < 8;
}

function loop(){
  analyser.getFloatTimeDomainData(timeData);
  const hz = detectPitchHz(timeData, audioCtx.sampleRate);
  if (hz && collecting){
    samplesHz.push(hz);
    const midi = hzToMidi(hz);
    const nn = midiToNoteName(midi, "de");
    els.curHz.textContent = hz.toFixed(1);
    els.curNote.textContent = `${nn.name}${nn.octave} (${nn.cents>=0?'+':''}${nn.cents} ct)`;
    els.curStab.textContent = stability(samplesHz).toFixed(2);
    // Live-Aggregat:
    showAggregatePreview([...samplesHz]);
  } else {
    els.curHz.textContent = "–"; els.curNote.textContent = "–";
  }
  rafId = requestAnimationFrame(loop);
}

function smoothAndSelectStable(hzArr){
  // 1) rudimentäre Glättung (Median über Fenster 5)
  const sm = medianFilter(hzArr, 5);
  // 2) Ausreißer
  const f = madFilter(sm, 3);
  // 3) stabile Mitte (optional: Varianzfenster)
  return f;
}

function medianFilter(arr, win=5){
  if (arr.length<3) return arr;
  const half = Math.floor(win/2);
  const out = [];
  for (let i=0;i<arr.length;i++){
    const s = Math.max(0,i-half), e = Math.min(arr.length, i+half+1);
    const slice = arr.slice(s,e).sort((a,b)=>a-b);
    const m = slice[Math.floor(slice.length/2)];
    out.push(m);
  }
  return out;
}

function stability(vals){
  if (vals.length<8) return 0;
  const last = vals.slice(-20);
  const mean = last.reduce((a,b)=>a+b,0)/last.length;
  const sd = Math.sqrt(last.reduce((s,v)=>s+(v-mean)*(v-mean),0)/last.length);
  return Math.max(0, 1 - sd/(mean*0.02)); // 0..1 grobe Heuristik
}

function showAggregatePreview(hzArr){
  const st = smoothAndSelectStable(hzArr);
  const cents = st.map(hzToCentClass);
  const cMean = circularMeanCents(cents);
  if (cMean==null){ els.resNote.textContent="–"; return; }
  // cMean in Note (Tonklasse): 0ct -> C; 100 -> ca. C#
  const midi = cMean/100; // 0..12
  const nn = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","H"];
  const name = nn[Math.round(midi)%12];
  els.resNote.textContent = `Ø Tonklasse: ${name}`;
  els.resDetail.textContent = `Kreis-Mittel: ${cMean.toFixed(0)} Cent (0=C) – vorläufig`;
}

function saveSession(){
  const stable = smoothAndSelectStable(samplesHz);
  if (stable.length<8) return;
  const stamp = new Date().toISOString();
  const cents = stable.map(hzToCentClass);
  const cMean = circularMeanCents(cents);
  const meanHz = stable.reduce((a,b)=>a+b,0)/stable.length;

  const entry = {
    id: stamp,
    samples: stable.slice(0,200).map(hz=>({ t:0, hz })),
    summary: { meanHz, cMeanCent: cMean }
  };
  store.sessions.unshift(entry);
  persistStore();
  renderSessions(); updateAggregate();
  els.save.disabled = true;
}

function updateAggregate(){
  const all = store.sessions.flatMap(s => s.samples.map(o=>o.hz));
  if (!all.length){ els.resDetail.textContent = "Noch keine Daten"; return; }
  const cents = all.map(hzToCentClass);
  const cMean = circularMeanCents(cents);
  const midi = cMean/100;
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","H"];
  const name = names[Math.round(midi)%12];
  els.resNote.textContent = `Dein bisheriger Grundton (Tonklasse): ${name}`;
  els.resDetail.textContent = `Über ${store.sessions.length} Durchläufe • Kreis-Mittel ${Math.round(cMean)} Cent`;
}

function renderSessions(){
  els.sessionList.innerHTML = "";
  for (const s of store.sessions){
    const li = document.createElement("li");
    const d = new Date(s.id).toLocaleString();
    const hz = s.summary.meanHz.toFixed(1);
    li.textContent = `${d} – Mittelwert: ${hz} Hz`;
    els.sessionList.appendChild(li);
  }
}

function clearAll(){
  if (!confirm("Wirklich alle lokalen Daten löschen?")) return;
  localStorage.removeItem(DBKEY);
  store.sessions = [];
  renderSessions();
  updateAggregate();
}

function loadStore(){
  try{
    return JSON.parse(localStorage.getItem(DBKEY)) || { sessions: [] };
  } catch { return { sessions: [] }; }
}
function persistStore(){ localStorage.setItem(DBKEY, JSON.stringify(store)); }
