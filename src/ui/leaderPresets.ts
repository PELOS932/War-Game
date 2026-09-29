/**
 * Leader Creator presets, randomiser, name lists and the localStorage store
 * for saved looks ("slots") and the last used profile.
 */
import {
  ACCENT_COLORS, ATTIRE_COLORS, BACKDROP_COLORS, EYE_COLORS, EYE_STYLES, BROW_STYLES, FACE_SHAPES, HAIR_COLORS,
  MOUTH_STYLES, NOSE_STYLES, SKIN_TONES, defaultProfile, normalizeProfile, type LeaderProfile,
} from '../sim/leaderProfile';

type P = Partial<LeaderProfile>;

export interface LeaderPreset { name: string; profile: LeaderProfile }

const mk = (p: P): LeaderProfile => normalizeProfile({ ...defaultProfile(), ...p });

export const PRESETS: LeaderPreset[] = [
  { name: 'Statesman', profile: mk({ name: 'Edward Whitlock', gender: 'male', age: 58, face: 2, skin: SKIN_TONES[1], hair: 2, hairColor: HAIR_COLORS[9], brows: 0, eyes: 0, eyeColor: EYE_COLORS[5], mouth: 1, lines: 0.45, attire: 0, attireColor: ATTIRE_COLORS[0], accentColor: ACCENT_COLORS[0], medals: 1, backdrop: 1, backdropColor: BACKDROP_COLORS[0] }) },
  { name: 'Stateswoman', profile: mk({ name: 'Helena Marchetti', gender: 'female', age: 52, face: 4, skin: SKIN_TONES[2], hair: 8, hairColor: HAIR_COLORS[6], brows: 2, eyes: 0, eyeColor: EYE_COLORS[4], mouth: 1, lines: 0.2, attire: 0, attireColor: ATTIRE_COLORS[11], accentColor: ACCENT_COLORS[9], backdrop: 2, backdropColor: BACKDROP_COLORS[2] }) },
  { name: 'Generalissimo', profile: mk({ name: 'Augusto Ferreira', gender: 'male', age: 64, face: 6, faceWidth: 0.8, skin: SKIN_TONES[4], hair: 3, hairColor: HAIR_COLORS[8], brows: 6, eyes: 3, eyeColor: EYE_COLORS[1], nose: 5, mouth: 2, lines: 0.6, facialHair: 2, attire: 2, attireColor: ATTIRE_COLORS[5], accentColor: ACCENT_COLORS[0], medals: 3, headwear: 1, backdrop: 4, backdropColor: BACKDROP_COLORS[7] }) },
  { name: 'Monarch', profile: mk({ name: 'Frederick IV', gender: 'male', age: 61, face: 3, skin: SKIN_TONES[0], hair: 5, hairColor: HAIR_COLORS[10], brows: 1, eyes: 0, eyeColor: EYE_COLORS[6], nose: 2, mouth: 0, lines: 0.5, facialHair: 3, attire: 4, attireColor: ATTIRE_COLORS[14], accentColor: ACCENT_COLORS[1], medals: 1, headwear: 4, backdrop: 5, backdropColor: BACKDROP_COLORS[1] }) },
  { name: 'Queen', profile: mk({ name: 'Adelaide II', gender: 'female', age: 55, face: 0, skin: SKIN_TONES[1], hair: 9, hairColor: HAIR_COLORS[9], brows: 2, eyes: 0, eyeColor: EYE_COLORS[6], mouth: 1, lines: 0.3, attire: 4, attireColor: ATTIRE_COLORS[11], accentColor: ACCENT_COLORS[1], medals: 1, headwear: 8, backdrop: 5, backdropColor: BACKDROP_COLORS[3] }) },
  { name: 'Revolutionary', profile: mk({ name: 'Ernesto Valdés', gender: 'male', age: 38, face: 3, skin: SKIN_TONES[3], hair: 5, hairColor: HAIR_COLORS[1], brows: 1, eyes: 5, eyeColor: EYE_COLORS[1], nose: 0, mouth: 0, lines: 0.1, facialHair: 3, attire: 6, attireColor: ATTIRE_COLORS[5], accentColor: ACCENT_COLORS[0], headwear: 2, backdrop: 6, backdropColor: BACKDROP_COLORS[6] }) },
  { name: 'Chairman', profile: mk({ name: 'Wei Zhenguo', gender: 'male', age: 66, face: 1, faceWidth: 0.75, skin: SKIN_TONES[2], hair: 3, hairColor: HAIR_COLORS[0], brows: 3, eyes: 6, eyeColor: EYE_COLORS[0], nose: 1, mouth: 0, lines: 0.35, attire: 7, attireColor: ATTIRE_COLORS[8], accentColor: ACCENT_COLORS[0], medals: 1, backdrop: 6, backdropColor: BACKDROP_COLORS[6] }) },
  { name: 'Supreme Guide', profile: mk({ name: 'Hossein Tabrizi', gender: 'male', age: 74, face: 3, skin: SKIN_TONES[3], hair: 0, hairColor: HAIR_COLORS[10], brows: 4, eyes: 3, eyeColor: EYE_COLORS[0], nose: 4, mouth: 2, lines: 0.8, facialHair: 6, glasses: 1, attire: 5, attireColor: ATTIRE_COLORS[2], accentColor: ACCENT_COLORS[5], headwear: 5, backdrop: 7, backdropColor: BACKDROP_COLORS[2] }) },
  { name: 'Sheikh', profile: mk({ name: 'Khalid Al-Rashid', gender: 'male', age: 50, face: 3, skin: SKIN_TONES[5], hair: 1, hairColor: HAIR_COLORS[0], brows: 1, eyes: 0, eyeColor: EYE_COLORS[0], nose: 2, mouth: 0, lines: 0.25, facialHair: 10, attire: 8, attireColor: ATTIRE_COLORS[4], accentColor: ACCENT_COLORS[0], headwear: 7, backdrop: 1, backdropColor: BACKDROP_COLORS[2] }) },
  { name: 'Admiral', profile: mk({ name: 'Charles Beaumont', gender: 'male', age: 59, face: 2, skin: SKIN_TONES[1], hair: 1, hairColor: HAIR_COLORS[9], brows: 3, eyes: 2, eyeColor: EYE_COLORS[5], nose: 0, mouth: 2, lines: 0.5, attire: 10, attireColor: ATTIRE_COLORS[9], accentColor: ACCENT_COLORS[1], medals: 2, headwear: 1, backdrop: 8, backdropColor: BACKDROP_COLORS[0] }) },
  { name: 'Technocrat', profile: mk({ name: 'Ingrid Solberg', gender: 'female', age: 44, face: 5, skin: SKIN_TONES[0], hair: 14, hairColor: HAIR_COLORS[7], brows: 5, eyes: 1, eyeColor: EYE_COLORS[5], mouth: 6, lines: 0.1, glasses: 2, attire: 11, attireColor: ATTIRE_COLORS[1], accentColor: ACCENT_COLORS[5], backdrop: 8, backdropColor: BACKDROP_COLORS[7] }) },
  { name: 'Junta Colonel', profile: mk({ name: 'Col. Moussa Diarra', gender: 'male', age: 45, face: 6, skin: SKIN_TONES[9], hair: 1, hairColor: HAIR_COLORS[0], brows: 6, eyes: 2, eyeColor: EYE_COLORS[0], nose: 1, mouth: 2, lines: 0.2, glasses: 3, attire: 3, attireColor: ATTIRE_COLORS[6], accentColor: ACCENT_COLORS[3], medals: 2, headwear: 2, backdrop: 4, backdropColor: BACKDROP_COLORS[5] }) },
];

// ---------------------------------------------------------------------------
// random
// ---------------------------------------------------------------------------
const FIRST_M = ['Alexander', 'Viktor', 'Rafael', 'Kenji', 'Omar', 'Lucas', 'Dmitri', 'Samuel', 'Arjun', 'Mateo', 'Henrik', 'Kwame', 'Julian', 'Tariq', 'Pierre', 'Marco', 'Nikolai', 'Emeka', 'Hiro', 'Carlos', 'Anders', 'Idris', 'Stefan', 'Gabriel', 'Tomasz', 'Rustam'];
const FIRST_F = ['Elena', 'Sofia', 'Amara', 'Ingrid', 'Mei', 'Isabel', 'Nadia', 'Priya', 'Charlotte', 'Leila', 'Anya', 'Valeria', 'Freya', 'Yuki', 'Zainab', 'Catherine', 'Marta', 'Ayesha', 'Beatriz', 'Olga', 'Helena', 'Ngozi', 'Camille', 'Astrid'];
const LAST = ['Varga', 'Castellanos', 'Okafor', 'Lindqvist', 'Moreau', 'Petrov', 'Takahashi', 'Haddad', 'Novak', 'Mendes', 'Kowalski', 'Adeyemi', 'Brandt', 'Rahman', 'Sokolov', 'Delacroix', 'Mansour', 'Holloway', 'Kaczmarek', 'Aydin', 'Serrano', 'Nakamura', 'Van der Berg', 'Whitmore', 'Mbeki', 'Ivanova', 'Rossi', 'Qureshi', 'Arnason', 'Chen'];

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const wpick = (w: number[]): number => {
  let t = 0;
  for (const x of w) t += x;
  let r = Math.random() * t;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return w.length - 1;
};

export function randomName(gender: 'male' | 'female'): string {
  return `${pick(gender === 'female' ? FIRST_F : FIRST_M)} ${pick(LAST)}`;
}

export function randomProfile(): LeaderProfile {
  const female = Math.random() < 0.4;
  const age = Math.round(34 + Math.random() * 44);
  const grey = age > 58 && Math.random() < 0.65;
  const skinIdx = Math.floor(Math.random() * SKIN_TONES.length);
  const darkHair = skinIdx >= 4 || Math.random() < 0.55;
  const hairColor = grey ? pick(HAIR_COLORS.slice(8, 12)) : darkHair ? pick(HAIR_COLORS.slice(0, 4)) : pick(HAIR_COLORS.slice(0, 8));
  // attire: suit, open collar, dress uniform, fatigues, royal, religious, revolutionary, tunic, thobe, sash, admiral, turtleneck
  const attire = wpick([10, 4, 5, 3, 2, 2, 2, 2, 2, 3, 1, 2]);
  const military = attire === 2 || attire === 3 || attire === 10;
  let headwear = 0;
  if (military && Math.random() < 0.6) headwear = attire === 3 ? pick([2, 2, 1, 3]) : 1;
  else if (attire === 4) headwear = female ? pick([8, 4, 0]) : pick([4, 4, 0]);
  else if (attire === 5) headwear = pick([5, 6, 0]);
  else if (attire === 6) headwear = pick([3, 2, 0, 0]);
  else if (attire === 8) headwear = pick([7, 7, 0]);
  const hair = female
    ? pick([7, 8, 9, 10, 14, 5, 3, 13])
    : age > 60 ? pick([0, 6, 12, 3, 2, 1, 5]) : pick([1, 2, 3, 4, 5, 11, 2, 13, 6]);
  const facialHair = female ? 0 : Math.random() < 0.45 ? 0 : wpick([0, 3, 4, 3, 2, 2, attire === 5 ? 6 : 1, 1, 1, 1, 3]);
  const p: LeaderProfile = {
    ...defaultProfile(),
    gender: female ? 'female' : 'male',
    name: randomName(female ? 'female' : 'male'),
    title: '',
    age,
    face: Math.floor(Math.random() * FACE_SHAPES.length),
    faceWidth: Math.random(),
    skin: SKIN_TONES[skinIdx],
    eyes: Math.floor(Math.random() * EYE_STYLES.length),
    eyeColor: skinIdx >= 5 ? pick(EYE_COLORS.slice(0, 3)) : pick(EYE_COLORS),
    brows: Math.floor(Math.random() * BROW_STYLES.length),
    nose: Math.floor(Math.random() * NOSE_STYLES.length),
    mouth: Math.floor(Math.random() * MOUTH_STYLES.length),
    lines: Math.max(0, Math.min(1, (age - 35) / 50 + (Math.random() - 0.5) * 0.3)),
    mark: Math.random() < 0.12 ? 1 + Math.floor(Math.random() * 4) : 0,
    hair,
    hairColor,
    facialHair,
    glasses: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 6) : 0,
    headwear,
    attire,
    attireColor: attire === 10 ? ATTIRE_COLORS[9] : military ? pick([ATTIRE_COLORS[5], ATTIRE_COLORS[6], ATTIRE_COLORS[7], ATTIRE_COLORS[12], ATTIRE_COLORS[0]]) : pick(ATTIRE_COLORS),
    accentColor: pick(ACCENT_COLORS),
    medals: military ? 1 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2),
    backdrop: Math.floor(Math.random() * 9),
    backdropColor: pick(BACKDROP_COLORS),
  };
  return normalizeProfile(p);
}

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
const STORE_KEY = 'sovereign-command-2030:leaders';

export interface SavedLook { id: string; savedAt: number; profile: LeaderProfile }

interface Store { v: 1; slots: SavedLook[]; lastSlot: string | null; current: LeaderProfile | null }

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Store>;
      const slots = Array.isArray(d.slots)
        ? d.slots.filter((s) => s && typeof s.id === 'string').map((s) => ({ id: s.id, savedAt: Number(s.savedAt) || 0, profile: normalizeProfile(s.profile) }))
        : [];
      return { v: 1, slots, lastSlot: typeof d.lastSlot === 'string' ? d.lastSlot : null, current: d.current ? normalizeProfile(d.current) : null };
    }
  } catch {
    /* corrupted or unavailable */
  }
  return { v: 1, slots: [], lastSlot: null, current: null };
}

function writeStore(s: Store): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export const MAX_SLOTS = 12;

export const leaderStore = {
  slots(): SavedLook[] {
    return readStore().slots.sort((a, b) => b.savedAt - a.savedAt);
  },
  lastSlot(): string | null {
    return readStore().lastSlot;
  },
  /** The last profile used (or being edited) — restored when the creator opens. */
  current(): LeaderProfile | null {
    return readStore().current;
  },
  setCurrent(p: LeaderProfile, slotId?: string | null): void {
    const s = readStore();
    s.current = normalizeProfile(p);
    if (slotId !== undefined) s.lastSlot = slotId;
    writeStore(s);
  },
  /** Saves into slot `id` (new slot when null). Returns the slot id, or null when full / storage fails. */
  save(p: LeaderProfile, id: string | null): string | null {
    const s = readStore();
    let slot = id ? s.slots.find((x) => x.id === id) : undefined;
    if (!slot) {
      if (s.slots.length >= MAX_SLOTS) return null;
      slot = { id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), savedAt: 0, profile: p };
      s.slots.push(slot);
    }
    slot.profile = normalizeProfile(p);
    slot.savedAt = Date.now();
    s.lastSlot = slot.id;
    s.current = slot.profile;
    return writeStore(s) ? slot.id : null;
  },
  remove(id: string): void {
    const s = readStore();
    s.slots = s.slots.filter((x) => x.id !== id);
    if (s.lastSlot === id) s.lastSlot = null;
    writeStore(s);
  },
};
