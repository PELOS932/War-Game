/**
 * Renderer dev harness: generates a world (real Earth when the builder exists,
 * else the procedural one), attaches a mock game and exposes `window.__render`
 * for scripted camera positioning / screenshots (scripts/render-shots.ts).
 */
import { DEFAULT_SETTINGS, generateWorld } from '../../worldgen/generate';
import type { WorldData } from '../../worldgen/types';
import { MapMode } from '../api';
import { createRenderer, Renderer } from '../index';
import { MockGame } from './mock';

const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud')!;
const loading = document.getElementById('loading')!;
const panel = document.getElementById('panel')!;

const earthModules = import.meta.glob('../../worldgen/earth/index.ts');

async function makeWorld(progress: (s: string, f: number) => void): Promise<WorldData> {
  const kind = params.get('world') ?? 'auto';
  const seed = Number(params.get('seed') ?? 12345);
  if (kind !== 'procedural') {
    const loader = earthModules['../../worldgen/earth/index.ts'];
    if (loader) {
      const mod = (await loader()) as Record<string, unknown>;
      const gen = mod.generateEarth as ((...a: unknown[]) => WorldData | Promise<WorldData>) | undefined;
      if (gen) {
        progress('Building Earth', 0);
        return await gen(progress);
      }
    } else if (kind === 'earth') {
      throw new Error('Earth builder not available yet');
    }
  }
  return generateWorld({ seed, ...DEFAULT_SETTINGS }, progress);
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const setP = (s: string, f: number) => { loading.textContent = `${s} ${(f * 100).toFixed(0)}%`; };
  const world = await makeWorld(setP);
  const tWorld = performance.now() - t0;
  const container = document.getElementById('map')!;
  const renderer = createRenderer(container) as Renderer;
  const q = params.get('quality');
  if (q === 'low' || q === 'medium' || q === 'high') renderer.applySettings({ quality: q });
  const t1 = performance.now();
  await renderer.loadWorld(world, setP);
  const tLoad = performance.now() - t1;
  const startHour = Number(params.get('hour') ?? 151 * 24 + 11);
  let game: MockGame | null = null;
  if (params.get('game') !== '0') {
    game = new MockGame(world, { startHour, player: Number(params.get('player') ?? 0), unitsPerNation: Number(params.get('upn') ?? 1) });
    game.setSpeed(Number(params.get('speed') ?? 1));
    renderer.attachGame(game);
  } else {
    renderer.previewHour = startHour;
  }
  loading.style.display = 'none';

  // Simple controls.
  const modeSel = document.createElement('select');
  for (const [k, v] of Object.entries(MapMode)) if (typeof v === 'number') modeSel.add(new Option(k, String(v)));
  modeSel.value = String(renderer.mapMode);
  modeSel.onchange = () => renderer.setMapMode(Number(modeSel.value) as MapMode);
  panel.appendChild(modeSel);
  for (const key of ['dayNight', 'clouds', 'shadows', 'hexGrid', 'labels', 'units'] as const) {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = renderer.settings[key];
    cb.onchange = () => renderer.applySettings({ [key]: cb.checked });
    l.append(cb, key);
    panel.appendChild(l);
  }
  const qSel = document.createElement('select');
  for (const k of ['low', 'medium', 'high']) qSel.add(new Option(k, k));
  qSel.value = renderer.settings.quality;
  qSel.onchange = () => renderer.applySettings({ quality: qSel.value as 'low' | 'medium' | 'high' });
  panel.appendChild(qSel);
  const spd = document.createElement('input');
  spd.type = 'range'; spd.min = '0'; spd.max = '5'; spd.value = String(game?.state.speed ?? 0);
  spd.oninput = () => game?.setSpeed(Number(spd.value));
  panel.appendChild(spd);

  renderer.onClick((e) => {
    console.log('click', e);
    if (e.button === 0 && e.hex >= 0) renderer.pingHex(e.hex, '#ffd84a');
    if (e.button === 0 && e.unitId >= 0) renderer.setSelectedUnits([e.unitId]);
    if (e.button === 2 && game && e.hex >= 0) {
      const sel = selected;
      if (sel.length) {
        const path = game.findPath(sel, e.hex) ?? [];
        renderer.showPath(path, false);
        game.moveUnits(sel, e.hex);
      }
    }
  });
  let selected: number[] = [];
  renderer.onBoxSelect((x0, y0, x1, y1) => {
    selected = renderer.unitsInScreenRect(x0, y0, x1, y1, game?.state.playerNation ?? 0);
    renderer.setSelectedUnits(selected);
  });
  let hoverInfo = '';
  renderer.onHover((hex, unit) => { hoverInfo = `hex ${hex} unit ${unit}`; });

  let paused = params.get('paused') === '1';
  let last = performance.now();
  let fps = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
    if (game && !paused) game.advance(dt);
    renderer.render(dt);
    const c = renderer.getCameraTarget();
    const st = renderer.stats;
    const ts = renderer.terrain?.stats;
    hud.textContent = `fps ${fps.toFixed(0)}  frame ${st.frameMs.toFixed(1)}ms cpu ${st.cpuMs.toFixed(1)}ms\n` +
      `calls ${st.drawCalls} tris ${(st.triangles / 1000).toFixed(0)}k\n` +
      `terrain drawn ${ts?.drawn} cached ${ts?.cached} queued ${ts?.queued}\n` +
      `cam ${c.x.toFixed(1)}, ${c.z.toFixed(1)} d=${c.distance.toFixed(2)}\n${hoverInfo}\n` +
      `world ${tWorld.toFixed(0)}ms load ${tLoad.toFixed(0)}ms`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  (window as unknown as Record<string, unknown>).__render = {
    renderer,
    world,
    game,
    ready: true,
    timings: { world: tWorld, load: tLoad },
    focus(x: number, z: number, d: number, yaw = 0) {
      renderer.cam.dYaw = yaw;
      renderer.cam.yaw = yaw;
      renderer.cam.focus(x, z, d, true);
      renderer.settle();
    },
    setHour(h: number) {
      if (game) game.state.hour = h;
      renderer.previewHour = h;
    },
    pause(p: boolean) { paused = p; },
    dayHour(x: number, localHour = 10, day = 151) {
      const lon = (x / (renderer.ctx?.worldW ?? 1)) * 360 - 180;
      return day * 24 + ((((localHour - lon / 15) % 24) + 24) % 24);
    },
    settle() { renderer.settle(); },
    burst(x: number, z: number, n?: number) { game?.burst(x, z, n); },
    city(name: string) { return world.cities.find((c) => c.name === name); },
    bigCities(n = 10) { return [...world.cities].sort((a, b) => b.population - a.population).slice(0, n).map((c) => ({ name: c.name, x: c.x, z: c.z, pop: c.population, nation: c.nation })); },
    stats() { return { ...renderer.stats, terrain: renderer.terrain?.stats }; },
  };
}

main().catch((e) => {
  loading.textContent = `Error: ${e instanceof Error ? e.stack : String(e)}`;
  console.error(e);
});
