/**
 * Player leader profile: the look and identity created in the Leader Creator.
 * Pure data (no DOM) so the simulation can store it on the player's Nation and
 * in save games; the UI renders it with drawLeaderPortrait (src/ui/leaderPortrait.ts).
 */

export interface LeaderProfile {
  v: 1;
  name: string;
  /** Custom title ('' = automatic, chosen by the ideology). */
  title: string;
  gender: 'male' | 'female';
  age: number; // 30..90
  // ---- face ----
  face: number; // face shape index
  faceWidth: number; // 0..1
  skin: string; // css colour
  eyes: number; // eye shape index
  eyeColor: string;
  brows: number; // eyebrow style index
  nose: number; // nose style index
  mouth: number; // mouth style index
  lines: number; // age lines 0..1
  mark: number; // 0 none, 1 scar, 2 mole, 3 eyepatch, 4 cheek scar
  // ---- hair ----
  hair: number; // hair style index
  hairColor: string;
  facialHair: number; // facial hair style index
  glasses: number; // glasses style index
  headwear: number; // headwear index
  // ---- attire ----
  attire: number; // attire style index
  attireColor: string;
  accentColor: string; // tie / sash / collar tabs / stole
  medals: number; // 0..3
  // ---- backdrop ----
  backdrop: number; // backdrop style index
  backdropColor: string;
}

export const FACE_SHAPES = ['Oval', 'Round', 'Square', 'Long', 'Heart', 'Diamond', 'Broad'];
export const EYE_STYLES = ['Almond', 'Round', 'Narrow', 'Hooded', 'Wide-set', 'Deep-set', 'Monolid'];
export const BROW_STYLES = ['Natural', 'Thick', 'Arched', 'Straight', 'Bushy', 'Thin', 'Furrowed'];
export const NOSE_STYLES = ['Straight', 'Broad', 'Aquiline', 'Button', 'Long', 'Roman'];
export const MOUTH_STYLES = ['Neutral', 'Smile', 'Stern', 'Grin', 'Thin lips', 'Full lips', 'Smirk'];
export const MARK_STYLES = ['None', 'Brow scar', 'Mole', 'Eyepatch', 'Duelling scar'];
export const HAIR_STYLES = [
  'Bald', 'Buzz cut', 'Side part', 'Slicked back', 'Pompadour', 'Curly', 'Receding', 'Long straight',
  'Bob', 'Bun', 'Long wavy', 'Flat top', 'Comb-over', 'Afro', 'Pixie',
];
export const FACIAL_HAIR_STYLES = [
  'Clean shaven', 'Stubble', 'Moustache', 'Full beard', 'Goatee', 'Chevron & chin', 'Long beard',
  'Handlebar', 'Mutton chops', 'Pencil moustache', 'Short boxed beard',
];
export const GLASSES_STYLES = ['None', 'Round', 'Rectangular', 'Aviator shades', 'Half-moon', 'Monocle', 'Heavy frames'];
export const HEADWEAR_STYLES = [
  'None', 'Peaked cap', 'Beret', 'Revolutionary cap', 'Royal crown', 'Turban', 'Skullcap', 'Keffiyeh', 'Tiara', 'Kepi', 'Fur hat',
];
export const ATTIRE_STYLES = [
  'Business suit', 'Suit, open collar', 'Military dress uniform', 'Combat fatigues', 'Royal regalia',
  'Religious robes', 'Revolutionary shirt', 'Tunic suit', 'Thobe & bisht', 'Presidential sash', 'Admiral whites', 'Turtleneck',
];
export const BACKDROP_STYLES = ['Studio', 'National flag', 'Office', 'Parliament', 'War room', 'Palace', 'Sunburst', 'Sanctuary', 'Night city'];

export const SKIN_TONES = ['#f6dcc6', '#f0cfb2', '#e7bd9a', '#dcae88', '#cf9d74', '#bf8a60', '#a8744d', '#8f5f3d', '#744a2f', '#5c3a25', '#472c1c'];
export const HAIR_COLORS = ['#141010', '#2a1b12', '#452c1b', '#6a4527', '#8f5a2c', '#b5652a', '#c9a064', '#e3cf9a', '#7a746e', '#a9a6a1', '#dcdad6', '#f2f0ea', '#3b2330', '#1e2a44'];
export const EYE_COLORS = ['#3b2414', '#5a3a1e', '#7a5a2c', '#6e7a3a', '#3f7a52', '#3f6f9e', '#6a8fb8', '#7c8488', '#9a6a2a'];
export const ATTIRE_COLORS = ['#1b2436', '#22252b', '#121316', '#4a4f57', '#3b2f26', '#3c4a2c', '#5a5a3a', '#6e6a58', '#56606a', '#e8e6df', '#5e1a22', '#1f3a70', '#2c4a6e', '#6b1f1f', '#4b2a5a', '#7a6a4a'];
export const ACCENT_COLORS = ['#b3202a', '#1d4fa0', '#d9a520', '#2a7a3a', '#6b2a8a', '#161616', '#b9bec4', '#e06a1a', '#5ab0e0', '#ffffff', '#8a1b1b', '#0f6e6e'];
export const BACKDROP_COLORS = ['#3e5a74', '#6a2020', '#2a4a34', '#4d3a64', '#5a4a30', '#2a2e36', '#a02020', '#1f5f7a', '#7a5a1a', '#3a3a3a'];

export function defaultProfile(): LeaderProfile {
  return {
    v: 1, name: 'Alexander Hale', title: '', gender: 'male', age: 54,
    face: 0, faceWidth: 0.5, skin: SKIN_TONES[2], eyes: 0, eyeColor: EYE_COLORS[5], brows: 0, nose: 0, mouth: 0, lines: 0.35, mark: 0,
    hair: 2, hairColor: HAIR_COLORS[3], facialHair: 0, glasses: 0, headwear: 0,
    attire: 0, attireColor: ATTIRE_COLORS[0], accentColor: ACCENT_COLORS[0], medals: 0,
    backdrop: 1, backdropColor: BACKDROP_COLORS[0],
  };
}

const idx = (v: unknown, n: number, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(n - 1, Math.round(v))) : d);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const col = (v: unknown, d: string): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const str = (v: unknown, d: string, max = 48): string => (typeof v === 'string' ? v.slice(0, max) : d);

/** Validates / repairs an untrusted profile (localStorage, save files). */
export function normalizeProfile(raw: unknown): LeaderProfile {
  const d = defaultProfile();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    v: 1,
    name: str(r.name, d.name).trim() || d.name,
    title: str(r.title, '', 40),
    gender: r.gender === 'female' ? 'female' : 'male',
    age: Math.round(num(r.age, 30, 90, d.age)),
    face: idx(r.face, FACE_SHAPES.length, d.face),
    faceWidth: num(r.faceWidth, 0, 1, d.faceWidth),
    skin: col(r.skin, d.skin),
    eyes: idx(r.eyes, EYE_STYLES.length, d.eyes),
    eyeColor: col(r.eyeColor, d.eyeColor),
    brows: idx(r.brows, BROW_STYLES.length, d.brows),
    nose: idx(r.nose, NOSE_STYLES.length, d.nose),
    mouth: idx(r.mouth, MOUTH_STYLES.length, d.mouth),
    lines: num(r.lines, 0, 1, d.lines),
    mark: idx(r.mark, MARK_STYLES.length, d.mark),
    hair: idx(r.hair, HAIR_STYLES.length, d.hair),
    hairColor: col(r.hairColor, d.hairColor),
    facialHair: idx(r.facialHair, FACIAL_HAIR_STYLES.length, d.facialHair),
    glasses: idx(r.glasses, GLASSES_STYLES.length, d.glasses),
    headwear: idx(r.headwear, HEADWEAR_STYLES.length, d.headwear),
    attire: idx(r.attire, ATTIRE_STYLES.length, d.attire),
    attireColor: col(r.attireColor, d.attireColor),
    accentColor: col(r.accentColor, d.accentColor),
    medals: idx(r.medals, 4, d.medals),
    backdrop: idx(r.backdrop, BACKDROP_STYLES.length, d.backdrop),
    backdropColor: col(r.backdropColor, d.backdropColor),
  };
}
