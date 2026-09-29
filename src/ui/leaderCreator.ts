/**
 * Leader Creator: design the player's head of state (procedural portrait),
 * with presets, randomiser, undo and saved looks in localStorage.
 *
 *   showLeaderCreator(root) → Promise<LeaderProfile | null>  (null = back to menu)
 */
import './leader.css';
import { h, clear, escapeHTML, setTip } from './dom';
import { icon } from './icons';
import { slider, type Slider } from './widgets';
import { confirm, toast } from './dialogs';
import { createBackdrop } from './backdrop';
import { installTooltips } from './tooltip';
import { drawLeaderPortrait, type PortraitDrawOpts } from './leaderPortrait';
import { PRESETS, leaderStore, randomName, randomProfile, MAX_SLOTS } from './leaderPresets';
import {
  ACCENT_COLORS, ATTIRE_COLORS, ATTIRE_STYLES, BACKDROP_COLORS, BACKDROP_STYLES, BROW_STYLES, EYE_COLORS, EYE_STYLES,
  FACE_SHAPES, FACIAL_HAIR_STYLES, GLASSES_STYLES, HAIR_COLORS, HAIR_STYLES, HEADWEAR_STYLES, MARK_STYLES, MOUTH_STYLES,
  NOSE_STYLES, SKIN_TONES, defaultProfile, normalizeProfile, type LeaderProfile,
} from '../sim/leaderProfile';

type Key = keyof LeaderProfile;
type TabId = 'presets' | 'identity' | 'face' | 'hair' | 'attire' | 'backdrop';

export const LEADER_TITLES = [
  'President', 'Prime Minister', 'Chancellor', 'Premier', 'General Secretary', 'Chairman', 'First Secretary',
  'Supreme Leader', 'King', 'Queen', 'Emperor', 'Empress', 'Sultan', 'Emir', 'Grand Duke', 'Grand Duchess',
  'Generalissimo', 'Marshal', 'Supreme Guide', 'Consul', 'Lord Protector', 'Chief Executive', 'Commander-in-Chief',
];

/** Thumbnail zoom & focus per option group (face features close up, outfits on the torso). */
const ZOOM: Partial<Record<Key, [number, PortraitDrawOpts['focus']]>> = {
  face: [1.7, 'head'], eyes: [3.2, 'eyes'], brows: [3.0, 'brows'], nose: [2.9, 'nose'], mouth: [3.0, 'mouth'], mark: [1.9, 'head'],
  hair: [1.55, 'crown'], facialHair: [2.0, 'chin'], glasses: [2.5, 'eyes'], headwear: [1.35, 'crown'], attire: [1.3, 'chest'], backdrop: [1, 'eyes'],
};

export function showLeaderCreator(root: HTMLElement): Promise<LeaderProfile | null> {
  installTooltips();
  return new Promise((resolve) => {
    let profile: LeaderProfile = leaderStore.current() ?? PRESETS[0].profile;
    let slotId: string | null = leaderStore.lastSlot();
    let savedJSON = slotId ? JSON.stringify(leaderStore.slots().find((s) => s.id === slotId)?.profile ?? null) : '';
    const undo: LeaderProfile[] = [];
    let tab: TabId = 'identity';
    const bd = createBackdrop();

    // ------------------------------------------------------------- preview
    const PW = 300, PH = 360;
    const canvas = h('canvas', { class: 'sc-lc-canvas', width: PW * 2, height: PH * 2 }) as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    const plateTitle = h('div', { class: 't' });
    const plateName = h('div', { class: 'n' });
    const plateMeta = h('div', { class: 'm' });
    const dossier = h('div', { class: 'sc-kv sc-lc-dossier' });
    const undoBtn = h('button', { class: 'sc-btn', tip: 'Undo the last change (Ctrl+Z)' }, h('span', { html: icon('undo') }), 'Undo');
    const randBtn = h('button', { class: 'sc-btn', tip: 'Randomise everything' }, h('span', { html: icon('patrol') }), 'Randomize');
    const randFaceBtn = h('button', { class: 'sc-btn', tip: 'Randomise the face and hair, keep the outfit and name' }, 'Face only');
    const randOutfitBtn = h('button', { class: 'sc-btn', tip: 'Randomise the outfit and backdrop, keep the face' }, 'Outfit only');
    const preview = h('div', { class: 'sc-lc-preview sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('person') }), 'Official Portrait'),
      h('div', { class: 'sc-lc-frame' }, canvas),
      h('div', { class: 'sc-lc-plate' }, plateTitle, plateName, plateMeta),
      h('div', { class: 'sc-lc-prevbtns' }, randBtn, undoBtn),
      h('div', { class: 'sc-lc-prevbtns' }, randFaceBtn, randOutfitBtn),
      h('div', { class: 'sc-sechead', style: 'margin:10px 12px 4px' }, 'Dossier'),
      dossier,
    );

    // -------------------------------------------------------------- editor
    const tabDefs: { id: TabId; label: string; ico: Parameters<typeof icon>[0] }[] = [
      { id: 'presets', label: 'Presets', ico: 'star' },
      { id: 'identity', label: 'Identity', ico: 'person' },
      { id: 'face', label: 'Face', ico: 'focus' },
      { id: 'hair', label: 'Hair & Hats', ico: 'helmet' },
      { id: 'attire', label: 'Attire', ico: 'medal' },
      { id: 'backdrop', label: 'Backdrop', ico: 'flag' },
    ];
    const tabEls = new Map<TabId, HTMLElement>();
    const tabBar = h('div', { class: 'sc-subtabs' });
    for (const t of tabDefs) {
      const el = h('div', { class: 'sc-subtab' }, h('span', { html: icon(t.ico) }), t.label);
      el.addEventListener('click', () => setTab(t.id));
      tabEls.set(t.id, el);
      tabBar.appendChild(el);
    }
    const body = h('div', { class: 'sc-lc-body sc-scroll' });
    const editor = h('div', { class: 'sc-lc-editor sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('gear') }), 'Customize'),
      h('div', { class: 'sc-lc-tabs' }, tabBar),
      body,
    );

    // ------------------------------------------------------------- saved looks
    const slotList = h('div', { class: 'sc-lc-slots sc-scroll sc-inset' });
    const saveBtn = h('button', { class: 'sc-btn primary', tip: 'Save changes to the selected look' }, h('span', { html: icon('save') }), 'Save');
    const saveNewBtn = h('button', { class: 'sc-btn', tip: 'Save as a new look' }, h('span', { html: icon('plus') }), 'Save as new');
    const slotCount = h('span', { class: 'sc-dim', style: 'font-weight:400;letter-spacing:0;text-transform:none' });
    const saved = h('div', { class: 'sc-lc-saved sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('save') }), 'Saved Looks', h('span', { class: 'sc-grow' }), slotCount),
      h('div', { class: 'sc-lc-savebtns' }, saveBtn, saveNewBtn),
      slotList,
      h('div', { class: 'sc-lc-hint sc-dim' }, 'Looks are stored in this browser. Your last look is remembered automatically.'),
    );

    // -------------------------------------------------------------- footer
    const backBtn = h('button', { class: 'sc-btn big' }, h('span', { html: icon('chevLeft') }), 'Main Menu');
    const goBtn = h('button', { class: 'sc-btn primary big' }, 'Continue — Choose Nation', h('span', { html: icon('chevRight') }));
    const header = h('div', { class: 'sc-lc-header' },
      h('div', { class: 'l1' }, 'Leader Creator'),
      h('div', { class: 'l2' }, 'Design the head of state who will lead your nation into 2030'),
    );
    const grid = h('div', { class: 'sc-lc-grid' }, preview, editor, saved);
    const footer = h('div', { class: 'sc-lc-footer' }, backBtn, h('span', { class: 'sc-grow' }), goBtn);
    const wrap = h('div', { class: 'sc-lc-wrap' }, header, grid, footer);
    const screen = h('div', { class: 'sc-screen sc-lc' }, bd.el, wrap);
    root.appendChild(screen);

    // ------------------------------------------------------------- state ops
    let dirtyThumbs = true;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderPreview();
        if (dirtyThumbs) renderThumbs();
        renderSlots();
      });
    };
    const set = (patch: Partial<LeaderProfile>, record = true) => {
      const next = normalizeProfile({ ...profile, ...patch });
      if (JSON.stringify(next) === JSON.stringify(profile)) return;
      if (record) {
        undo.push(profile);
        if (undo.length > 60) undo.shift();
      }
      profile = next;
      dirtyThumbs = true;
      leaderStore.setCurrent(profile);
      syncControls();
      schedule();
    };
    const replace = (p: LeaderProfile) => {
      undo.push(profile);
      profile = normalizeProfile(p);
      dirtyThumbs = true;
      leaderStore.setCurrent(profile);
      buildTab();
      schedule();
    };

    const renderPreview = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawLeaderPortrait(ctx, profile, 0, 0, canvas.width, canvas.height);
      plateTitle.textContent = profile.title || 'Head of State';
      plateName.textContent = profile.name;
      plateMeta.textContent = `${profile.gender === 'female' ? 'Female' : 'Male'} · Age ${profile.age}`;
      undoBtn.toggleAttribute('disabled', !undo.length);
      const rows: [string, string][] = [
        ['Face', `${FACE_SHAPES[profile.face]}, ${EYE_STYLES[profile.eyes].toLowerCase()} eyes`],
        ['Hair', profile.hair === 0 ? 'Bald' : HAIR_STYLES[profile.hair]],
        ['Facial hair', FACIAL_HAIR_STYLES[profile.facialHair]],
        ['Attire', ATTIRE_STYLES[profile.attire]],
        ['Headwear', HEADWEAR_STYLES[profile.headwear]],
        ['Decorations', ['None', 'Ribbons / pin', 'Medals', 'Full regalia'][profile.medals]],
        ['Backdrop', BACKDROP_STYLES[profile.backdrop]],
      ];
      dossier.innerHTML = rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${escapeHTML(v)}</div>`).join('');
    };

    // ------------------------------------------------------------- controls
    interface Thumb { canvas: HTMLCanvasElement; key: Key; value: number; el: HTMLElement }
    let thumbs: Thumb[] = [];
    const syncers: (() => void)[] = [];
    const syncControls = () => {
      for (const s of syncers) s();
    };

    const section = (title: string, ...kids: (Node | null)[]) => h('div', { class: 'sc-lc-sec' }, h('div', { class: 'sc-sechead' }, title), ...kids);

    const optionGrid = (key: Key, names: string[], cls = '') => {
      const wrapEl = h('div', { class: 'sc-lc-opts ' + cls });
      const zoom = ZOOM[key]?.[0] ?? 1;
      const W = zoom >= 2.5 ? 62 : 54, Hh = zoom >= 2.5 ? 40 : 64;
      names.forEach((nm, i) => {
        const c = h('canvas', { width: W * 2, height: Hh * 2, style: `width:${W}px;height:${Hh}px` }) as HTMLCanvasElement;
        const el = h('div', { class: 'sc-lc-opt' }, c, h('span', null, nm));
        setTip(el, `<b>${escapeHTML(nm)}</b>`);
        el.addEventListener('click', () => set({ [key]: i } as Partial<LeaderProfile>));
        wrapEl.appendChild(el);
        thumbs.push({ canvas: c, key, value: i, el });
      });
      return wrapEl;
    };

    const swatches = (key: Key, colors: string[]) => {
      const row = h('div', { class: 'sc-lc-swatches' });
      const els: HTMLElement[] = [];
      for (const col of colors) {
        const b = h('div', { class: 'sc-lc-sw', style: `background:${col}` });
        b.addEventListener('click', () => set({ [key]: col } as Partial<LeaderProfile>));
        els.push(b);
        row.appendChild(b);
      }
      const custom = h('input', { type: 'color', class: 'sc-lc-custom', tip: 'Custom colour' }) as HTMLInputElement;
      custom.addEventListener('input', () => set({ [key]: custom.value } as Partial<LeaderProfile>, false));
      custom.addEventListener('change', () => set({ [key]: custom.value } as Partial<LeaderProfile>));
      row.appendChild(custom);
      syncers.push(() => {
        const v = String(profile[key]).toLowerCase();
        els.forEach((e, i) => e.classList.toggle('on', colors[i].toLowerCase() === v));
        if (custom !== document.activeElement) custom.value = v;
      });
      return row;
    };

    let dragStart: LeaderProfile | null = null;
    const sliderCtl = (key: Key, label: string, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const s: Slider = slider({
        label, min, max, step, value: Number(profile[key]), format: fmt,
        onInput: (v) => {
          if (!dragStart) dragStart = profile;
          set({ [key]: v } as Partial<LeaderProfile>, false);
        },
        onChange: (v) => {
          set({ [key]: v } as Partial<LeaderProfile>, false);
          if (dragStart && JSON.stringify(dragStart) !== JSON.stringify(profile)) undo.push(dragStart);
          dragStart = null;
          renderPreview();
        },
      });
      syncers.push(() => s.set(Number(profile[key])));
      return s.el;
    };

    const segmented = (key: Key, opts: { label: string; value: string | number }[]) => {
      const row = h('div', { class: 'sc-chips' });
      const els = opts.map((o) => {
        const c = h('div', { class: 'sc-chip' }, o.label);
        c.addEventListener('click', () => set({ [key]: o.value } as Partial<LeaderProfile>));
        row.appendChild(c);
        return c;
      });
      syncers.push(() => opts.forEach((o, i) => els[i].classList.toggle('on', profile[key] === o.value)));
      return row;
    };

    const buildTab = () => {
      clear(body);
      thumbs = [];
      syncers.length = 0;
      for (const [id, el] of tabEls) el.classList.toggle('on', id === tab);
      switch (tab) {
        case 'presets': {
          const g = h('div', { class: 'sc-lc-presets' });
          for (const pr of PRESETS) {
            const c = h('canvas', { width: 180, height: 216 }) as HTMLCanvasElement;
            const pc = c.getContext('2d');
            if (pc) drawLeaderPortrait(pc, pr.profile, 0, 0, 180, 216);
            const card = h('div', { class: 'sc-lc-preset' }, c, h('span', null, pr.name));
            setTip(card, `<b>${escapeHTML(pr.name)}</b><br>${escapeHTML(pr.profile.name)}<div class="tt-sep"></div><span class="sc-dim">Click to start from this preset</span>`);
            card.addEventListener('click', () => { slotId = null; savedJSON = ''; replace(pr.profile); });
            g.appendChild(card);
          }
          body.append(
            h('div', { class: 'sc-dim', style: 'margin:2px 2px 8px' }, 'Start from an archetype, then fine-tune every detail in the other tabs.'),
            g,
          );
          break;
        }
        case 'identity': {
          const nameIn = h('input', { class: 'sc-input sc-lc-text', type: 'text', maxlength: 48, spellcheck: false }) as HTMLInputElement;
          nameIn.addEventListener('input', () => set({ name: nameIn.value || ' ' }, false));
          nameIn.addEventListener('keydown', (e) => e.stopPropagation());
          const rn = h('button', { class: 'sc-btn', tip: 'Random name' }, h('span', { html: icon('patrol') }));
          rn.addEventListener('click', () => set({ name: randomName(profile.gender) }));
          const titleIn = h('input', { class: 'sc-input sc-lc-text', type: 'text', maxlength: 40, placeholder: 'Automatic (set by your ideology)', list: 'sc-lc-titles', spellcheck: false }) as HTMLInputElement;
          const dl = h('datalist', { id: 'sc-lc-titles' }, ...LEADER_TITLES.map((t) => h('option', { value: t })));
          titleIn.addEventListener('input', () => set({ title: titleIn.value }, false));
          titleIn.addEventListener('keydown', (e) => e.stopPropagation());
          syncers.push(() => {
            if (document.activeElement !== nameIn) nameIn.value = profile.name;
            if (document.activeElement !== titleIn) titleIn.value = profile.title;
          });
          const titleChips = h('div', { class: 'sc-chips', style: 'margin-top:5px' });
          for (const t of ['', 'President', 'Prime Minister', 'Chancellor', 'General Secretary', 'Supreme Leader', 'King', 'Queen', 'Emir', 'Generalissimo', 'Supreme Guide']) {
            const c = h('div', { class: 'sc-chip' }, t || 'Automatic');
            c.addEventListener('click', () => set({ title: t }));
            titleChips.appendChild(c);
            syncers.push(() => c.classList.toggle('on', profile.title === t));
          }
          body.append(
            section('Name', h('div', { class: 'sc-row' }, nameIn, rn)),
            section('Title', titleIn, dl, titleChips,
              h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-top:4px' }, 'Leave on Automatic to take the customary title of the ideology you choose (e.g. General Secretary, King, President).')),
            section('Gender Presentation', segmented('gender', [{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }])),
            section('Age', sliderCtl('age', 'Age', 30, 90, 1, (v) => `${v} yrs`)),
            section('Skin Tone', swatches('skin', SKIN_TONES)),
          );
          break;
        }
        case 'face':
          body.append(
            section('Face Shape', optionGrid('face', FACE_SHAPES)),
            section('Build', sliderCtl('faceWidth', 'Face width', 0, 1, 0.05, (v) => v < 0.33 ? 'Narrow' : v > 0.66 ? 'Broad' : 'Medium'),
              sliderCtl('lines', 'Age lines', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)),
            section('Skin Tone', swatches('skin', SKIN_TONES)),
            section('Eyes', optionGrid('eyes', EYE_STYLES, 'wide')),
            section('Eye Colour', swatches('eyeColor', EYE_COLORS)),
            section('Eyebrows', optionGrid('brows', BROW_STYLES, 'wide')),
            section('Nose', optionGrid('nose', NOSE_STYLES, 'wide')),
            section('Mouth & Expression', optionGrid('mouth', MOUTH_STYLES, 'wide')),
            section('Distinguishing Marks', optionGrid('mark', MARK_STYLES)),
          );
          break;
        case 'hair':
          body.append(
            section('Hair Style', optionGrid('hair', HAIR_STYLES)),
            section('Hair Colour', swatches('hairColor', HAIR_COLORS)),
            section('Facial Hair', optionGrid('facialHair', FACIAL_HAIR_STYLES)),
            section('Glasses', optionGrid('glasses', GLASSES_STYLES, 'wide')),
            section('Headwear', optionGrid('headwear', HEADWEAR_STYLES)),
          );
          break;
        case 'attire':
          body.append(
            section('Attire', optionGrid('attire', ATTIRE_STYLES)),
            section('Main Colour', swatches('attireColor', ATTIRE_COLORS)),
            section('Accent Colour (tie, sash, stole, beret, collar tabs)', swatches('accentColor', ACCENT_COLORS)),
            section('Decorations', segmented('medals', [{ label: 'None', value: 0 }, { label: 'Ribbons / pin', value: 1 }, { label: 'Medals', value: 2 }, { label: 'Full regalia', value: 3 }])),
          );
          break;
        case 'backdrop':
          body.append(
            section('Backdrop', optionGrid('backdrop', BACKDROP_STYLES)),
            section('Backdrop Colour', swatches('backdropColor', BACKDROP_COLORS)),
            h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin:6px 2px' }, 'The "National flag" backdrop shows your nation\'s flag once you have chosen a country.'),
          );
          break;
      }
      dirtyThumbs = true;
      syncControls();
      schedule();
    };

    const renderThumbs = () => {
      dirtyThumbs = false;
      for (const t of thumbs) {
        const tc = t.canvas.getContext('2d');
        if (!tc) continue;
        const p = { ...profile, [t.key]: t.value } as LeaderProfile;
        // make the relevant feature visible in its thumbnail
        if (t.key === 'facialHair' && p.gender === 'female') p.gender = 'male';
        if ((t.key === 'hair' || t.key === 'facialHair' || t.key === 'glasses') && p.headwear === 7) p.headwear = 0;
        tc.clearRect(0, 0, t.canvas.width, t.canvas.height);
        const zf = ZOOM[t.key];
        drawLeaderPortrait(tc, p, 0, 0, t.canvas.width, t.canvas.height, { zoom: zf?.[0] ?? 1, focus: zf?.[1] });
        t.el.classList.toggle('on', profile[t.key] === t.value);
      }
    };

    const setTab = (id: TabId) => {
      tab = id;
      buildTab();
    };

    // ------------------------------------------------------------- slots
    const ago = (ms: number) => {
      const s = (Date.now() - ms) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
      return new Date(ms).toLocaleDateString();
    };
    let slotsKey = '';
    const renderSlots = () => {
      const slots = leaderStore.slots();
      const cur = JSON.stringify(profile);
      const key = JSON.stringify(slots.map((s) => [s.id, s.savedAt])) + slotId + (cur === savedJSON);
      saveBtn.toggleAttribute('disabled', !slotId || cur === savedJSON);
      saveNewBtn.toggleAttribute('disabled', slots.length >= MAX_SLOTS);
      slotCount.textContent = `${slots.length}/${MAX_SLOTS}`;
      if (key === slotsKey) return;
      slotsKey = key;
      clear(slotList);
      if (!slots.length) {
        slotList.appendChild(h('div', { class: 'sc-empty sc-dim', style: 'padding:24px 10px;text-align:center' }, 'No saved looks yet.', h('br'), 'Press Save as new to keep this one.'));
        return;
      }
      for (const s of slots) {
        const c = h('canvas', { width: 80, height: 96 }) as HTMLCanvasElement;
        const cc = c.getContext('2d');
        if (cc) drawLeaderPortrait(cc, s.profile, 0, 0, 80, 96, { zoom: 1.3 });
        const del = h('button', { class: 'sc-btn sm danger', tip: 'Delete this look', html: icon('close') });
        const modified = s.id === slotId && cur !== savedJSON;
        const row = h('div', { class: 'sc-lc-slot' + (s.id === slotId ? ' sel' : '') },
          c,
          h('div', { class: 'info' },
            h('div', { class: 'nm' }, s.profile.name + (modified ? ' *' : '')),
            h('div', { class: 'tl' }, s.profile.title || 'Head of State'),
            h('div', { class: 'dt' }, (modified ? 'Unsaved changes · ' : '') + 'Saved ' + ago(s.savedAt)),
          ),
          del,
        );
        row.addEventListener('click', () => {
          slotId = s.id;
          savedJSON = JSON.stringify(s.profile);
          leaderStore.setCurrent(s.profile, s.id);
          replace(s.profile);
          toast(`Loaded "${s.profile.name}"`);
        });
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          confirm('Delete Look', `Delete the saved look "${s.profile.name}"?`, 'Delete', () => {
            leaderStore.remove(s.id);
            if (slotId === s.id) { slotId = null; savedJSON = ''; }
            slotsKey = '';
            renderSlots();
          }, true);
        });
        slotList.appendChild(row);
      }
    };
    saveBtn.addEventListener('click', () => {
      if (!slotId) return;
      const id = leaderStore.save(profile, slotId);
      if (id) {
        savedJSON = JSON.stringify(profile);
        toast(`Saved "${profile.name}"`);
      } else toast('Could not save (storage unavailable)', true);
      slotsKey = '';
      renderSlots();
    });
    saveNewBtn.addEventListener('click', () => {
      const id = leaderStore.save(profile, null);
      if (id) {
        slotId = id;
        savedJSON = JSON.stringify(profile);
        toast(`Saved new look "${profile.name}"`);
      } else toast(leaderStore.slots().length >= MAX_SLOTS ? `All ${MAX_SLOTS} slots are in use — delete one first` : 'Could not save (storage unavailable)', true);
      slotsKey = '';
      renderSlots();
    });

    // ------------------------------------------------------------- buttons
    randBtn.addEventListener('click', () => { slotId = null; savedJSON = ''; replace(randomProfile()); });
    randFaceBtn.addEventListener('click', () => {
      const r = randomProfile();
      const keep = profile.gender === r.gender ? r : { ...randomProfile(), gender: profile.gender };
      const rr = normalizeProfile({ ...keep, gender: profile.gender, facialHair: profile.gender === 'female' ? 0 : keep.facialHair });
      set({ face: rr.face, faceWidth: rr.faceWidth, skin: rr.skin, eyes: rr.eyes, eyeColor: rr.eyeColor, brows: rr.brows, nose: rr.nose, mouth: rr.mouth, hair: profile.gender === 'female' ? [7, 8, 9, 10, 14, 5][Math.floor(Math.random() * 6)] : rr.hair, hairColor: rr.hairColor, facialHair: rr.facialHair, lines: rr.lines, mark: rr.mark });
    });
    randOutfitBtn.addEventListener('click', () => {
      const r = randomProfile();
      set({ attire: r.attire, attireColor: r.attireColor, accentColor: r.accentColor, medals: r.medals, headwear: r.headwear === 8 && profile.gender === 'male' ? 0 : r.headwear, backdrop: r.backdrop, backdropColor: r.backdropColor });
    });
    undoBtn.addEventListener('click', () => doUndo());
    const doUndo = () => {
      const prev = undo.pop();
      if (!prev) return;
      profile = prev;
      leaderStore.setCurrent(profile);
      dirtyThumbs = true;
      syncControls();
      schedule();
    };

    let done = false;
    const finish = (result: LeaderProfile | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      if (result) leaderStore.setCurrent(result, slotId);
      screen.style.transition = 'opacity .3s';
      screen.style.opacity = '0';
      screen.style.pointerEvents = 'none';
      setTimeout(() => {
        bd.destroy();
        screen.remove();
      }, 320);
      resolve(result);
    };
    backBtn.addEventListener('click', () => finish(null));
    goBtn.addEventListener('click', () => {
      const p = normalizeProfile({ ...profile, name: profile.name.trim() || defaultProfile().name });
      finish(p);
    });
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sc-dialog')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        doUndo();
      } else if (e.key === 'r' || e.key === 'R') { slotId = null; savedJSON = ''; replace(randomProfile()); }
    };
    window.addEventListener('keydown', onKey);

    buildTab();
    renderPreview();
  });
}
