// Sound effects and music, synthesised with the Web Audio API: the only file that touches an
// AudioContext. What plays and how it is shaped is decided in sound-model.ts and music-model.ts;
// this file only builds nodes from that data. The graph builders take a BaseAudioContext, so an
// OfflineAudioContext can render them for measurement.
//
// Browsers start audio only after a user gesture, so the context is created on the first tap or
// key press that has something to play. It is suspended while the page is hidden. Where Web Audio
// is missing every call is a no-op. Gain budget: see sound-model.ts.
import { useEffect, useRef, useState } from 'react';
import {
  BAR_SECONDS,
  catchUp,
  type MusicPosition,
  musicBar,
  type NoteEvent,
  ROOM,
  VOICES,
} from './music-model.ts';
import { createRng } from './rng.ts';
import {
  type EffectRecipe,
  effectLength,
  effectRecipe,
  effectScale,
  type GameSnapshot,
  gameSounds,
  MIX,
  type SoundEffect,
  type SoundLayer,
} from './sound-model.ts';
import { audible, readSound, type SoundPreferences, writeSound } from './sound-preferences.ts';

/** The level an envelope starts from and fades to: -80 dB, inaudible, and > 0 for exp ramps. */
const SILENT = 0.0001;
/** Notes are scheduled this far ahead; the timer that schedules them runs every TICK_MS. */
const LOOKAHEAD = 1.5;
const TICK_MS = 250;
const MUSIC_SEED = 1;
const NOISE_SECONDS = 1;

export interface Mixer {
  /** Everything goes through it; mute ramps it to 0. */
  master: GainNode;
  effects: GainNode;
  /** The music bus: ducked under effects. */
  music: GainNode;
}

/** Master gain, the effects bus, and the music bus with its low-pass and room. */
export function createMixer(context: BaseAudioContext, destination: AudioNode): Mixer {
  const master = new GainNode(context, { gain: MIX.master });
  master.connect(destination);
  const effects = new GainNode(context, { gain: MIX.effects });
  effects.connect(master);
  const music = new GainNode(context, { gain: MIX.music });
  const lowpass = new BiquadFilterNode(context, {
    type: 'lowpass',
    frequency: ROOM.lowpass,
    Q: 0.5,
  });
  music.connect(lowpass);
  lowpass.connect(new GainNode(context, { gain: ROOM.dry })).connect(master);
  const room = new ConvolverNode(context, { buffer: impulseResponse(context) });
  lowpass
    .connect(room)
    .connect(new GainNode(context, { gain: ROOM.wet }))
    .connect(master);
  return { master, effects, music };
}

/** Seeded white noise, the same on every run. */
export function noiseBuffer(context: BaseAudioContext, seed: number): AudioBuffer {
  const length = Math.round(NOISE_SECONDS * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const random = createRng(seed);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) samples[index] = random() * 2 - 1;
  return buffer;
}

/** A stereo room: decorrelated noise in each ear, fading to silence over ROOM.seconds. */
export function impulseResponse(context: BaseAudioContext): AudioBuffer {
  const length = Math.round(ROOM.seconds * context.sampleRate);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const random = createRng(channel + 11);
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      samples[index] = (random() * 2 - 1) * (1 - index / length) ** ROOM.fade;
    }
  }
  return buffer;
}

/** Silence, up to `peak` over `attack`, down to silence over `decay`: exponential, no clicks. */
function strike(gain: AudioParam, at: number, attack: number, decay: number, peak: number): void {
  gain.setValueAtTime(SILENT, at);
  gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
}

function layerSource(
  context: BaseAudioContext,
  layer: SoundLayer,
  at: number,
  noise: AudioBuffer,
): AudioScheduledSourceNode & AudioNode {
  if (layer.kind === 'noise') return new AudioBufferSourceNode(context, { buffer: noise });
  const oscillator = new OscillatorNode(context, { type: layer.wave });
  oscillator.frequency.setValueAtTime(layer.frequency, at);
  const end = at + layer.attack + layer.decay;
  if (layer.endFrequency !== layer.frequency) {
    oscillator.frequency.exponentialRampToValueAtTime(layer.endFrequency, end);
  }
  return oscillator;
}

function playLayer(
  context: BaseAudioContext,
  output: AudioNode,
  layer: SoundLayer,
  start: number,
  noise: AudioBuffer,
): void {
  const at = start + layer.start;
  const source = layerSource(context, layer, at, noise);
  const envelope = new GainNode(context, { gain: SILENT });
  strike(envelope.gain, at, layer.attack, layer.decay, layer.gain);
  const input =
    layer.kind === 'noise'
      ? new BiquadFilterNode(context, {
          type: layer.filter,
          frequency: layer.frequency,
          Q: layer.q,
        })
      : envelope;
  if (input !== envelope) input.connect(envelope);
  source.connect(input);
  envelope.connect(output);
  // A different stretch of the noise for each layer, so clacks are not identical copies.
  const offset = layer.kind === 'noise' ? (layer.frequency % 997) / 2000 : 0;
  if (source instanceof AudioBufferSourceNode) source.start(at, offset);
  else source.start(at);
  source.stop(at + layer.attack + layer.decay + 0.05);
}

/** The music dips to MIX.duck of its level under an effect and comes back over duckRelease. */
function duck(music: GainNode, at: number, length: number): void {
  music.gain.cancelScheduledValues(at);
  music.gain.setTargetAtTime(MIX.music * MIX.duck, at, MIX.duckAttack / 3);
  music.gain.setTargetAtTime(MIX.music, at + Math.min(length, 0.3), MIX.duckRelease / 3);
}

/** Every layer of `recipe`, starting at `at` seconds of the context's clock. */
export function playEffect(
  context: BaseAudioContext,
  mixer: Mixer,
  recipe: EffectRecipe,
  at: number,
  noise: AudioBuffer,
): void {
  const output = new GainNode(context, { gain: effectScale(recipe) });
  output.connect(mixer.effects);
  for (const layer of recipe.layers) playLayer(context, output, layer, at, noise);
  if (recipe.duck) duck(mixer.music, at, effectLength(recipe));
}

/** Two oscillators a few cents apart: the slow beating makes the tone breathe. */
function detunedPair(context: BaseAudioContext, note: NoteEvent, cents: number, at: number) {
  return [-cents / 2, cents / 2].map((detune) => {
    const oscillator = new OscillatorNode(context, {
      type: VOICES[note.voice].wave,
      frequency: note.frequency,
      detune,
    });
    oscillator.start(at);
    return oscillator;
  });
}

/** A soft pluck: quick attack, a filter that closes, an exponential ring. */
function pluck(context: BaseAudioContext, output: AudioNode, note: NoteEvent, at: number): void {
  const { attack, detuneCents, brightness, darkness } = VOICES.pluck;
  const filter = new BiquadFilterNode(context, { type: 'lowpass', Q: 0.7 });
  filter.frequency.setValueAtTime(brightness, at);
  filter.frequency.exponentialRampToValueAtTime(darkness, at + Math.min(0.4, note.duration));
  const envelope = new GainNode(context, { gain: SILENT });
  strike(envelope.gain, at, attack, note.duration, note.gain);
  for (const oscillator of detunedPair(context, note, detuneCents, at)) {
    oscillator.connect(filter);
    oscillator.stop(at + attack + note.duration + 0.05);
  }
  filter.connect(envelope).connect(output);
}

/** A pad: a slow swell, held, then a long release that overlaps the next chord. */
function pad(context: BaseAudioContext, output: AudioNode, note: NoteEvent, at: number): void {
  const { attack, release, detuneCents } = VOICES.pad;
  const envelope = new GainNode(context, { gain: 0 });
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(note.gain, at + attack);
  envelope.gain.setValueAtTime(note.gain, at + note.duration);
  envelope.gain.exponentialRampToValueAtTime(SILENT, at + note.duration + release);
  for (const oscillator of detunedPair(context, note, detuneCents, at)) {
    oscillator.connect(envelope);
    oscillator.stop(at + note.duration + release + 0.05);
  }
  envelope.connect(output);
}

/** Every note of `bar`, its bar starting at `at` seconds of the context's clock. */
export function playBar(context: BaseAudioContext, output: AudioNode, bar: number, at: number) {
  for (const note of musicBar(MUSIC_SEED, bar)) {
    const play = note.voice === 'pad' ? pad : pluck;
    play(context, output, note, at + note.time);
  }
}

interface MusicRun {
  output: GainNode;
  timer: ReturnType<typeof setInterval>;
}

interface Engine {
  context: AudioContext;
  mixer: Mixer;
  noise: AudioBuffer;
  music: MusicRun | undefined;
}

/**
 * Schedules bars whose start is within LOOKAHEAD; a suspended clock schedules nothing. Bars missed
 * while the timer was held up are skipped (catchUp), never played late all at once.
 */
function startMusic(engine: Engine): MusicRun {
  const { context } = engine;
  const output = new GainNode(context, { gain: 1 });
  output.connect(engine.mixer.music);
  let position: MusicPosition = { bar: 0, next: context.currentTime + 0.1 };
  const tick = () => {
    position = catchUp(position, context.currentTime, BAR_SECONDS);
    while (position.next < context.currentTime + LOOKAHEAD) {
      playBar(context, output, position.bar, position.next);
      position.bar += 1;
      position.next += BAR_SECONDS;
    }
  };
  tick();
  return { output, timer: setInterval(tick, TICK_MS) };
}

/** Fades the notes already scheduled, then lets them go. */
function stopMusic(engine: Engine, run: MusicRun): void {
  clearInterval(run.timer);
  run.output.gain.setTargetAtTime(0, engine.context.currentTime, MIX.musicFade / 3);
  setTimeout(() => {
    run.output.disconnect();
  }, MIX.musicFade * 2000);
}

/** The engine follows the preferences: master level for mute, music on or off. */
function follow(engine: Engine, preferences: SoundPreferences): void {
  const now = engine.context.currentTime;
  const level = preferences.muted ? 0 : MIX.master;
  engine.mixer.master.gain.setTargetAtTime(level, now, MIX.muteRamp);
  const wanted = audible(preferences).music;
  if (wanted && engine.music === undefined) engine.music = startMusic(engine);
  if (!wanted && engine.music !== undefined) {
    stopMusic(engine, engine.music);
    engine.music = undefined;
  }
}

function webAudio(): boolean {
  return typeof AudioContext === 'function';
}

function createEngine(): Engine {
  const context = new AudioContext({ latencyHint: 'interactive' });
  return {
    context,
    mixer: createMixer(context, context.destination),
    noise: noiseBuffer(context, 5),
    music: undefined,
  };
}

/** Wakes a context the browser suspended; a refusal (no gesture yet) is retried on the next. */
function wake(engine: Engine): void {
  if (engine.context.state === 'running' || document.visibilityState !== 'visible') return;
  engine.context.resume().catch(() => undefined);
}

/** A light tick where the device has a vibration motor; never throws. */
function vibrate(pattern: readonly number[]): void {
  if (pattern.length === 0 || typeof navigator === 'undefined') return;
  try {
    if ('vibrate' in navigator) navigator.vibrate([...pattern]);
  } catch {
    // Blocked by the browser (no gesture yet, or a policy): no tick then.
  }
}

type SoundStorage = Pick<Storage, 'getItem' | 'setItem'>;

const NO_STORAGE: SoundStorage = { getItem: () => null, setItem: () => undefined };

function storage(): SoundStorage {
  try {
    return typeof localStorage === 'undefined' ? NO_STORAGE : localStorage;
  } catch {
    return NO_STORAGE;
  }
}

export interface Sound {
  preferences: SoundPreferences;
  /** The corner button. */
  toggleMuted: () => void;
  /** The menu switches. */
  toggleEffects: () => void;
  toggleMusic: () => void;
  /** An effect the game state cannot show: a blocked tap, a menu, a button. */
  play: (effect: SoundEffect) => void;
}

interface Live {
  engine: Engine | undefined;
  preferences: SoundPreferences;
}

function playOn(live: Live, effect: SoundEffect, variation: number): void {
  const { engine } = live;
  if (engine === undefined || !audible(live.preferences).effects) return;
  wake(engine);
  const recipe = effectRecipe(effect, variation);
  playEffect(engine.context, engine.mixer, recipe, engine.context.currentTime, engine.noise);
  vibrate(recipe.vibrate);
}

/** Creates the engine inside a gesture when there is something to hear, and wakes it. */
function unlock(live: Live): void {
  const { effects, music } = audible(live.preferences);
  if (live.engine === undefined && webAudio() && (effects || music)) {
    live.engine = createEngine();
    follow(live.engine, live.preferences);
  }
  if (live.engine !== undefined) wake(live.engine);
}

/** Chrome counts pointerdown as a gesture; Safari and iOS only touchend, click and keydown. */
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

/** Gesture and visibility listeners for the page's lifetime; closes the context on unmount. */
function useAudioLifetime(live: Live): void {
  useEffect(() => {
    const onGesture = () => {
      unlock(live);
    };
    const onVisibility = () => {
      const { engine } = live;
      if (engine === undefined) return;
      if (document.visibilityState === 'visible') wake(engine);
      else engine.context.suspend().catch(() => undefined);
    };
    for (const name of GESTURES) window.addEventListener(name, onGesture, { capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      for (const name of GESTURES) window.removeEventListener(name, onGesture, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      if (live.engine?.music !== undefined) clearInterval(live.engine.music.timer);
      live.engine?.context.close().catch(() => undefined);
      live.engine = undefined;
    };
  }, [live]);
}

/** Plays the slide, win and shuffle of each change of the game on screen (see gameSounds). */
function useGameSounds(live: Live, game: GameSnapshot | undefined): void {
  const previous = useRef<GameSnapshot | undefined>(undefined);
  useEffect(() => {
    if (game === undefined) return;
    const cues = gameSounds(previous.current, game);
    previous.current = game;
    for (const cue of cues) playOn(live, cue.effect, cue.variation);
  }, [live, game]);
}

/**
 * Sound for the puzzle screen. Pass the game on screen; slides, the win and new games sound by
 * themselves. Call `play` for what the game cannot show (a blocked tap, the menu, buttons).
 */
export function useSound(game: GameSnapshot | undefined): Sound {
  const [preferences, setPreferences] = useState(() => readSound(storage()));
  const [live] = useState<Live>(() => ({ engine: undefined, preferences }));
  live.preferences = preferences;
  useAudioLifetime(live);
  useGameSounds(live, game);
  const change = (next: SoundPreferences, cue: SoundEffect | undefined) => {
    live.preferences = next;
    writeSound(storage(), next);
    setPreferences(next);
    unlock(live);
    if (live.engine !== undefined) follow(live.engine, next);
    if (cue !== undefined) playOn(live, cue, 0);
  };
  const toggle = (key: 'effects' | 'music') => {
    const next = { ...preferences, [key]: !preferences[key] };
    change(next, next[key] ? 'toggle-on' : 'toggle-off');
  };
  return {
    preferences,
    toggleMuted: () => {
      change({ ...preferences, muted: !preferences.muted }, undefined);
    },
    toggleEffects: () => {
      toggle('effects');
    },
    toggleMusic: () => {
      toggle('music');
    },
    play: (effect) => {
      playOn(live, effect, 0);
    },
  };
}
