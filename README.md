# Sovereign Command 2030

A real-time 3D grand strategy game in the browser, closely modelled on
**Supreme Ruler 2030**. You lead any of the world's nations on a hex map of
the real Earth: run the economy, research, build, make alliances and fight
wars against AI governments that do the same.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
```

On first launch the world is built in a background worker (about 10–20 s)
and then cached in IndexedDB, so later launches start instantly.

## The world

- **Real Earth geography.** Coastlines and national borders come from the
  public-domain Natural Earth outlines in the `world-atlas` npm package. That
  is the only outside geographic data the game uses.
- **Our own 3D terrain.** Elevation is modelled in code from hand-written
  tables of the world's mountain ranges, plateaus, volcanoes, depressions,
  continental shelves, ocean ridges and trenches. Hydraulic erosion is then
  run over it. No elevation rasters or satellite images are used.
- **Simulated climate.** Temperature and rainfall come from a model with
  latitude bands, prevailing winds, rain shadows and the tropical rain belt,
  plus hand-tuned regional adjustments. That model produces the biomes,
  seasonal snow and a satellite-like surface colour.
- **Water and cities.** Major rivers and lakes are drawn by hand. About 190
  countries have 2030 statistics, alliances, rivalries and real flags, and
  about 500 real cities have procedurally built skylines.
- **Map scale.** The hex grid is 720 × 326 hexes, 0.5° of longitude per
  column.

## Gameplay (Supreme Ruler style)

- **Time:** real time with pause and 5 speeds, in hourly ticks, with a
  day/night terminator and seasons.
- **Economy:** 11 resources (Agriculture, Rubber, Timber, Petroleum, Coal,
  Metal Ore, Uranium, Electric Power, Consumer Goods, Industry Goods and
  Military Goods) with production chains and a dynamic world market. Finance
  covers taxes, social spending, bonds, credit rating, approval,
  unemployment and inflation.
- **Military:** land, air and naval units over four technology generations.
  - Movement depends on terrain, roads and rail, river crossings and zones
    of control.
  - Combat accounts for weapon ranges, armour types, terrain,
    entrenchment, supply and experience.
  - Air units fly missions from bases; navies fight at sea; land units can
    make amphibious landings.
- **Research:** a tech tree across economy, industry, energy, society,
  land, air, naval, missiles and cyber.
- **Diplomacy:** treaties, alliances (NATO, CSTO, GCC…), wars with alliance
  obligations, peace deals, aid, world opinion and DEFCON.
- **AI governments:** ministers for finance, research, defence and foreign
  affairs, plus military command.
  - The military AI forms fronts, prepares and launches offensives, runs air
    and naval operations and makes amphibious landings.
  - You can hand any of your own departments to your AI ministers, as in
    Supreme Ruler.
- **Interface:** closely modelled on Supreme Ruler 2030. It has a top bar,
  a tabbed command panel, a minimap with map modes, a unit panel, a news
  ticker and diplomatic proposals.

## Controls

| Action | Input |
| --- | --- |
| Pan | WASD / arrow keys / right- or middle-drag / screen edge |
| Zoom | Mouse wheel |
| Rotate | Q / E or Alt + drag |
| Select units | Left click, Shift + click to add, left-drag box |
| Move / attack | Right click |
| Pause / speed | Space, 1–5 |

## Project layout

```
src/app/        app shell: boot flow, world loading/caching, game loop
src/core/       RNG, noise, hex grid, pathfinding
src/worldgen/   world building (earth/ = real Earth; legacy procedural generator)
src/data/       countries, cities, alliances, relations (2030 estimates)
src/render/     Three.js renderer (terrain, water, sky, vegetation, cities, units, effects)
src/sim/        simulation (economy, military, diplomacy, research, events, save/load)
src/sim/ai/     AI governments
src/ui/         Supreme Ruler–style interface
scripts/        headless preview/test scripts (npx tsx scripts/…)
```
