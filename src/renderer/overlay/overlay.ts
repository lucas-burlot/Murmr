// Floating pill: records the microphone (MediaRecorder, Opus) while the hotkey
// is held, draws a live waveform, and shows the pipeline state.

import { translate } from '../../shared/i18n';
import type { OverlayCommand, StateEvent } from '../../shared/types';
import './overlay.css';

const pill = document.getElementById('pill')!;
const label = document.getElementById('label')!;
const timer = document.getElementById('timer')!;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d')!;

// --- sounds (synthesized, no audio files) ----------------------------------

let soundsEnabled = true;
let audioCtx: AudioContext | null = null;

function beep(freqs: number[], ms = 70): void {
  if (!soundsEnabled) return;
  audioCtx ??= new AudioContext();
  let t = audioCtx.currentTime;
  for (const freq of freqs) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.005);
    gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
    t += ms / 1000;
  }
}

// --- recording ---------------------------------------------------------------

const MIME_TYPE = 'audio/webm;codecs=opus';
const BARS = 28;

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  analysisCtx: AudioContext;
  analyser: AnalyserNode;
  startedAt: number;
  peakRms: number;
  levels: number[];
  raf: number;
}

let session: Session | null = null;
let starting: Promise<void> | null = null;
let cancelled = false;
let wantPcm = false; // the local engine needs raw 16 kHz PCM instead of Opus

/** Decodes the Opus recording and resamples it to 16 kHz mono signed 16-bit PCM. */
async function toPcm16(blob: Blob): Promise<ArrayBuffer> {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const samples = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
    return pcm.buffer;
  } finally {
    void ctx.close();
  }
}

async function openMicrophone(deviceId: string): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: true,
    autoGainControl: false, // AGC amplifies silence, which makes Whisper hallucinate
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio,
    });
  } catch (err) {
    if (!deviceId) throw err;
    return navigator.mediaDevices.getUserMedia({ audio }); // chosen mic unplugged: use default
  }
}

async function start(deviceId: string): Promise<void> {
  cancelled = false;
  const stream = await openMicrophone(deviceId);
  if (cancelled) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  const analysisCtx = new AudioContext();
  const analyser = analysisCtx.createAnalyser();
  analyser.fftSize = 1024;
  analysisCtx.createMediaStreamSource(stream).connect(analyser);

  const recorder = new MediaRecorder(stream, { mimeType: MIME_TYPE, audioBitsPerSecond: 32_000 });
  const s: Session = {
    stream,
    recorder,
    chunks: [],
    analysisCtx,
    analyser,
    startedAt: performance.now(),
    peakRms: 0,
    levels: new Array(BARS).fill(0),
    raf: 0,
  };
  recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
  recorder.start(250);
  session = s;
  beep([660, 880]); // played once the mic is live: the user can start talking
  draw();
}

function draw(): void {
  const s = session;
  if (!s) return;
  const samples = new Float32Array(s.analyser.fftSize);
  s.analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / samples.length);
  s.peakRms = Math.max(s.peakRms, rms);
  s.levels.push(Math.min(1, Math.sqrt(rms) * 2.2));
  s.levels.shift();

  const { width, height } = canvas;
  ctx2d.clearRect(0, 0, width, height);
  const step = width / BARS;
  ctx2d.fillStyle = 'rgba(255,255,255,0.9)';
  s.levels.forEach((level, i) => {
    const h = Math.max(4, level * height);
    ctx2d.beginPath();
    ctx2d.roundRect(i * step + step * 0.2, (height - h) / 2, step * 0.6, h, 3);
    ctx2d.fill();
  });

  const seconds = Math.floor((performance.now() - s.startedAt) / 1000);
  timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  s.raf = requestAnimationFrame(draw);
}

function release(s: Session): void {
  cancelAnimationFrame(s.raf);
  s.stream.getTracks().forEach((t) => t.stop());
  void s.analysisCtx.close();
  session = null;
}

async function stop(): Promise<void> {
  await starting?.catch(() => undefined);
  const s = session;
  if (!s) {
    // Released before the microphone was ready: nothing was recorded.
    await window.murmr.overlay.sendRecording({ audio: new ArrayBuffer(0), mimeType: MIME_TYPE, durationMs: 0, peakRms: 0 });
    return;
  }
  const durationMs = performance.now() - s.startedAt;
  await new Promise<void>((resolve) => {
    s.recorder.onstop = () => resolve();
    s.recorder.stop();
  });
  release(s);
  beep([880, 660]);
  const blob = new Blob(s.chunks, { type: MIME_TYPE });
  const audio = await blob.arrayBuffer();
  const pcm16 = wantPcm && blob.size ? await toPcm16(blob) : undefined;
  await window.murmr.overlay.sendRecording({ audio, mimeType: MIME_TYPE, durationMs, peakRms: s.peakRms, pcm16 });
}

function cancel(): void {
  cancelled = true;
  if (session) {
    session.recorder.onstop = null;
    session.recorder.stop();
    release(session);
  }
}

window.murmr.overlay.onCommand((cmd: OverlayCommand) => {
  if (cmd.type === 'start') {
    soundsEnabled = cmd.sounds;
    wantPcm = cmd.pcm;
    starting = start(cmd.deviceId).catch((err: Error) => {
      if (err.name === 'NotAllowedError') window.murmr.overlay.reportError('error.micDenied');
      else window.murmr.overlay.reportError('error.micUnavailable', err.message);
    });
  } else if (cmd.type === 'stop') {
    void stop();
  } else {
    cancel();
  }
});

// --- state display -----------------------------------------------------------

window.murmr.state.onChange(({ state, messageKey, detail, sounds, lang }: StateEvent) => {
  soundsEnabled = sounds;
  if (state === 'idle') {
    pill.classList.add('hidden');
    return;
  }
  pill.dataset.state = state;
  pill.classList.remove('hidden');
  label.textContent = translate(lang, messageKey ?? `state.${state}`, { detail: detail ?? '' });
  if (state === 'recording') timer.textContent = '0:00';
  if (state === 'error') beep([300, 200], 120);
});
