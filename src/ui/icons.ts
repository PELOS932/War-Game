/**
 * Inline SVG icon set for the UI (all hand-authored). Monochrome icons use
 * `currentColor`; resource icons are full colour.
 */
import { UnitCategory, UnitClass, CATEGORY_CLASS, Resource, FacilityType } from '../sim/types';

const S = (body: string, extra = ''): string =>
  `<svg class="sc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

const P = {
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8"/>',
  flag: '<path d="M5 21V3.5"/><path d="M5 4h12l-2.5 4 2.5 4H5" fill="currentColor" fill-opacity=".25"/>',
  overview: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 17v-4M12 17V8M16 17v-6"/>',
  cabinet: '<path d="M3 20.5h18M5 17.5h14M12 3l8 5H4z"/><path d="M6.5 9v8M10 9v8M14 9v8M17.5 9v8"/>',
  tank: '<path d="M2.5 15h19l-2 4h-15z"/><path d="M6 15l1.5-4h8l1.5 4"/><path d="M15 12.2l6.5-2"/><path d="M6.5 17h.1M10 17h.1M13.5 17h.1M17 17h.1"/>',
  hammer: '<path d="M10.5 6l2.5-2.5 6.5 6.5-2.5 2.5z" fill="currentColor" fill-opacity=".3"/><path d="M12.5 10.5L4.2 18.8a1.4 1.4 0 002 2l8.3-8.3" stroke-width="2.2"/>',
  flask: '<path d="M9 3h6M10 3v6L4.6 18.8A1.5 1.5 0 005.9 21h12.2a1.5 1.5 0 001.3-2.2L14 9V3"/><path d="M7 15h10"/>',
  handshake: '<path d="M1.5 8h3l2 8h-4z"/><path d="M22.5 8h-3l-2 8h4z"/><path d="M6.8 9.2L10.5 7l3 1 5.2-.5"/><path d="M7.5 15l2 2M9.5 13.5l2.4 2.4M12 12.2l2.4 2.4M14.5 11l2 2"/><path d="M11 9.8l-1.8 1.7a1 1 0 001.5 1.4l2.3-1.6"/>',
  factory: '<path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z"/><path d="M7 17.5h2M12 17.5h2M17 17.5h1"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/>',
  move: '<path d="M4 12h13"/><path d="M12.5 6l6 6-6 6"/>',
  attack: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  hold: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M8 12h8"/>',
  aggressive: '<path d="M6 12.5l6-6 6 6M6 18.5l6-6 6 6"/>',
  defensive: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  holdGround: '<path d="M5 21h14M9 21V3.5l8 3-8 3.5"/>',
  passive: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  retreat: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  reinforce: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  disband: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  bomb: '<circle cx="10" cy="14" r="6"/><path d="M14.3 9.7l2.2-2.2"/><path d="M18 6l1.5-1.5M19.5 9h2M15 3v-1.5"/>',
  patrol: '<path d="M20 12a8 8 0 01-14.3 4.9"/><path d="M4 12a8 8 0 0114.3-4.9"/><path d="M18.5 3v4.5H14"/><path d="M5.5 21v-4.5H10"/>',
  plane: '<path d="M12 2l1.5 6 7 4v2l-7-2-.5 5 2.5 2v1.5L12 19.5l-3.5 1V19l2.5-2-.5-5-7 2v-2l7-4z"/>',
  intercept: '<path d="M14 3l1.2 4.8 5.6 3.2v1.6l-5.6-1.6-.4 4 2 1.6V18L14 17l-2.8 1v-1.4l2-1.6-.4-4-5.6 1.6V11l5.6-3.2z"/><path d="M2 20l6-6M2 14.5V20h5.5"/>',
  runway: '<path d="M3 21h18"/><path d="M12 2.5l1.2 5 5.8 3v1.6l-5.8-1.6-.4 3.8 2 1.6v1.2L12 17l-2.8 1.1v-1.2l2-1.6-.4-3.8L5 13.1v-1.6l5.8-3z"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  burst: '<path d="M12 2l1.8 5.6 5.3-2.8-2.8 5.3L22 12l-5.7 1.8 2.8 5.3-5.3-2.8L12 22l-1.8-5.7-5.3 2.8 2.8-5.3L2 12l5.7-1.9-2.8-5.3 5.3 2.8z"/>',
  focus: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="2.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 8h10M7 12h5M7 16h5"/><rect x="14" y="12" width="3" height="4"/>',
  pause: '<rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-1-1.8-1.5-3-1.5-1.8 0-3 1-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.3 0-2.5-.6-3.2-1.6M12 5v2M12 17v2"/>',
  chart: '<path d="M3 20h18"/><path d="M4 16l5-5 4 3 7-8"/><path d="M15 6h5v5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M15.5 14.4c3 0 5.5 2 5.5 5"/>',
  truck: '<path d="M2 6h11v10H2zM13 9.5h5l3 3.5v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  mountain: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.3 11l1.7 1.5 1.6-1.5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  venn: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9.5 4L12 20M14.5 4L12 20"/>',
  hexes: '<path d="M8 3l3.5 2v4L8 11 4.5 9V5z"/><path d="M16 3l3.5 2v4L16 11l-3.5-2V5z"/><path d="M12 11l3.5 2v4L12 19l-3.5-2v-4z"/>',
  hex: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>',
  labels: '<path d="M5 6.5V4h14v2.5M12 4v16M9 20h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 00.5-8 5.5 5.5 0 00-10.6 1.5A3.4 3.4 0 007 18.5z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  starFill: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.3"/>',
  swords: '<path d="M4 3l11 11M20 3L9 14"/><path d="M13 16l4 4M11 16l-4 4M16 12.5l-3.5 3.5M8 12.5l3.5 3.5"/>',
  podium: '<path d="M6 21h12M8 21v-8h8v8M5 13h14l-2-3.5H7z"/><circle cx="12" cy="5.5" r="2"/>',
  exclaim: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.3"/>',
  save: '<path d="M4 4h13l3 3v13H4z"/><path d="M8 4v5h7V4M7 20v-6h10v6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  exit: '<path d="M10 4H4v16h6"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  chevLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevRight: '<path d="M9 5l7 7-7 7"/>',
  chevUp: '<path d="M5 15l7-7 7 7"/>',
  chevDown: '<path d="M5 9l7 7 7-7"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/><rect x="9.5" y="9.5" width="5" height="5"/>',
  city: '<path d="M3 21h18M5 21V9h5v12M10 21V4h6v17M16 21v-9h4v9"/><path d="M12.5 7.5h1M12.5 11h1M12.5 14.5h1"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M4 14c0 4 4 7 8 7s8-3 8-7"/>',
  helmet: '<path d="M3 15.5h18M5 15.5c0-5 3-9 7-9s7 4 7 9M4 15.5l-1 3h18l-1-3"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  road: '<path d="M8 21l2-18M16 21l-2-18M12 5v2M12 11v2M12 17v2"/>',
  whiteFlag: '<path d="M5 21V3"/><path d="M5 4c3-2 6 2 9 0s4-1 5 0v8c-1-1-2-2-5 0s-6-2-9 0" fill="currentColor" fill-opacity=".35"/>',
  shieldCheck: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  embassy: '<path d="M3 21h18M5 21V10h14v11M12 3l8 5.5H4z"/><path d="M10 21v-5h4v5"/>',
  trade: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.4-6.4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  nuke: '<circle cx="12" cy="12" r="2"/><path d="M12 10L8.5 4a9 9 0 017 0zM13.8 13l6.9.2a9 9 0 01-3.5 6.1zM10.2 13l-3.4 6.3a9 9 0 01-3.5-6.1z" fill="currentColor" fill-opacity=".5"/>',
  undo: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 010 10h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  sort: '<path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 6l9 7 9-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  expand: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
  collapse: '<path d="M10 4v6H4M14 20v-6h6M4 10l6-6M20 14l-6 6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  fuel: '<path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M6 8h6"/><path d="M14 9h2a2 2 0 012 2v6a1.5 1.5 0 003 0V8l-3-3"/>',
  ammo: '<path d="M7 21V9c0-3 1.5-5 2.5-6 1 1 2.5 3 2.5 6v12zM14 21V11c0-2.5 1-4 2-5 1 1 2 2.5 2 5v10z"/>',
  spade: '<path d="M12 3v12M8 15h8l-1 5a3 3 0 01-6 0z"/><path d="M9 3h6"/>',
  medal: '<path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12l1 2h2l-1.6 1.3.6 2.2-2-1.3-2 1.3.6-2.2L9 14h2z" fill="currentColor"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/>',
};

export type IconName = keyof typeof P;

export function icon(name: IconName, cls = ''): string {
  const body = P[name];
  return cls ? S(body, `data-i="${name}"`).replace('class="sc-ico"', `class="sc-ico ${cls}"`) : S(body, `data-i="${name}"`);
}

/** Same as icon() but as a DOM element. */
export function iconEl(name: IconName, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = 'sc-icw' + (cls ? ' ' + cls : '');
  span.innerHTML = icon(name);
  return span;
}

// ---------------------------------------------------------------------------
// Resource icons (full colour)
// ---------------------------------------------------------------------------
const RS = (body: string): string => `<svg class="sc-rico" viewBox="0 0 24 24">${body}</svg>`;

const RES_ICONS: string[] = [
  // Agriculture — wheat
  RS('<path d="M12 22V8" stroke="#c9a84a" stroke-width="1.6" fill="none"/>' +
    [0, 1, 2, 3].map((i) => {
      const y = 5 + i * 3.6;
      return `<ellipse cx="9.3" cy="${y + 1.5}" rx="2.3" ry="1.3" transform="rotate(-35 9.3 ${y + 1.5})" fill="#f1cf5c" stroke="#9c7b24" stroke-width=".6"/>` +
        `<ellipse cx="14.7" cy="${y + 1.5}" rx="2.3" ry="1.3" transform="rotate(35 14.7 ${y + 1.5})" fill="#e8c14c" stroke="#9c7b24" stroke-width=".6"/>`;
    }).join('') + '<ellipse cx="12" cy="4" rx="1.3" ry="2.2" fill="#f5d86a" stroke="#9c7b24" stroke-width=".6"/>'),
  // Rubber — tyre
  RS('<circle cx="12" cy="12" r="9" fill="#2a2a2a" stroke="#6f6f6f" stroke-width="1.2"/><circle cx="12" cy="12" r="4.2" fill="#8d8d8d" stroke="#1b1b1b"/><circle cx="12" cy="12" r="1.5" fill="#444"/>' +
    Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<path d="M${(12 + Math.cos(a) * 6.6).toFixed(1)} ${(12 + Math.sin(a) * 6.6).toFixed(1)}L${(12 + Math.cos(a) * 8.6).toFixed(1)} ${(12 + Math.sin(a) * 8.6).toFixed(1)}" stroke="#5d5d5d" stroke-width="1.4"/>`;
    }).join('')),
  // Timber — logs
  RS('<rect x="3" y="12" width="15" height="7" rx="3.5" fill="#8a5a2b" stroke="#4a2e12" stroke-width=".8"/>' +
    '<rect x="6" y="5" width="15" height="7" rx="3.5" fill="#9b6834" stroke="#4a2e12" stroke-width=".8"/>' +
    '<ellipse cx="18" cy="15.5" rx="3" ry="3.5" fill="#e0b27a" stroke="#4a2e12" stroke-width=".8"/><ellipse cx="18" cy="15.5" rx="1.3" ry="1.6" fill="none" stroke="#a0703a" stroke-width=".7"/>' +
    '<ellipse cx="21" cy="8.5" rx="2.6" ry="3.5" fill="#e6bb85" stroke="#4a2e12" stroke-width=".8"/><ellipse cx="21" cy="8.5" rx="1.1" ry="1.6" fill="none" stroke="#a0703a" stroke-width=".7"/>'),
  // Petroleum — oil drop + barrel
  RS('<rect x="4" y="9" width="11" height="13" rx="1.5" fill="#2d4f7c" stroke="#10213a" stroke-width=".8"/><path d="M4 13h11M4 18h11" stroke="#17365c" stroke-width="1.2"/>' +
    '<path d="M17.5 2.5c2.8 3.6 4 5.6 4 7.4a4 4 0 01-8 0c0-1.8 1.2-3.8 4-7.4z" fill="#141414" stroke="#d9a441" stroke-width=".9"/><ellipse cx="16.4" cy="9.4" rx=".8" ry="1.3" fill="#777"/>'),
  // Coal — lumps
  RS('<path d="M3 18l3-6 5-1 3 4-1 5H5z" fill="#333" stroke="#111" stroke-width=".8"/><path d="M11 11l4-5 5 2 1 6-4 3-3-2z" fill="#474747" stroke="#111" stroke-width=".8"/>' +
    '<path d="M6.5 13l3-.6M13.5 8l2.5 1" stroke="#9a9a9a" stroke-width=".9"/><path d="M13 20l3-2 5 1-1 3h-7z" fill="#2a2a2a" stroke="#111" stroke-width=".8"/>'),
  // Metal ore — ingots
  RS('<path d="M2.5 20l2-5h8l2 5z" fill="#9aa7b4" stroke="#3b4652" stroke-width=".8"/><path d="M11.5 20l2-5h8l2 5z" transform="translate(-2 0)" fill="#b7c3cf" stroke="#3b4652" stroke-width=".8"/>' +
    '<path d="M7 14l2-5h8l2 5z" fill="#cfd8e1" stroke="#3b4652" stroke-width=".8"/><path d="M9.5 10h6" stroke="#fff" stroke-width=".8" opacity=".8"/>'),
  // Uranium — trefoil
  RS('<circle cx="12" cy="12" r="10" fill="#f2d21b" stroke="#6b5a00" stroke-width=".8"/><circle cx="12" cy="12" r="1.8" fill="#111"/>' +
    '<path d="M12 9.6L8.4 3.4a9.2 9.2 0 017.2 0zM14.1 13.2l7.2.1a9.2 9.2 0 01-3.6 6.2zM9.9 13.2L6.3 19.4a9.2 9.2 0 01-3.6-6.2z" fill="#111"/>'),
  // Electric power — bolt
  RS('<path d="M13.5 1.5L4.5 13.5h6l-2 9 10-13h-6.2z" fill="#ffd53d" stroke="#8a6500" stroke-width=".9" stroke-linejoin="round"/>'),
  // Consumer goods — shopping bag
  RS('<path d="M4.5 8h15l-1.2 13.5H5.7z" fill="#4fa3d9" stroke="#163d59" stroke-width=".9"/><path d="M8.5 10V6.5a3.5 3.5 0 017 0V10" fill="none" stroke="#163d59" stroke-width="1.4"/><path d="M6.5 11h11" stroke="#9fd3f5" stroke-width=".8"/>'),
  // Industry goods — gear
  RS('<g transform="translate(12 12)">' +
    Array.from({ length: 8 }, (_, i) => `<rect x="-1.9" y="-10.4" width="3.8" height="4.5" rx=".6" fill="#a3aeb8" stroke="#3a434c" stroke-width=".7" transform="rotate(${i * 45})"/>`).join('') +
    '<circle r="7" fill="#a3aeb8" stroke="#3a434c" stroke-width=".8"/><circle r="2.8" fill="#39424b"/></g>'),
  // Military goods — shell
  RS('<path d="M9 21V10c0-3.5 1.4-6.3 3-8 1.6 1.7 3 4.5 3 8v11z" fill="#8f8a3a" stroke="#3e3b12" stroke-width=".8"/><rect x="8.2" y="16" width="7.6" height="5.5" rx=".6" fill="#c99a3d" stroke="#5e4411" stroke-width=".8"/><path d="M9 12.5h6" stroke="#d8d27a" stroke-width=".9"/>'),
];

export function resourceIcon(r: Resource | number): string {
  return RES_ICONS[r] ?? RES_ICONS[0];
}

export const RESOURCE_SHORT = ['Agri', 'Rubber', 'Timber', 'Oil', 'Coal', 'Ore', 'Uran', 'Power', 'Cons', 'Ind', 'Mil'];

export const RESOURCE_UNITS = ['kt', 'kt', 'kt', 'Mbbl', 'kt', 'kt', 't', 'GWh', 'Mu', 'Mu', 'Mu'];

// ---------------------------------------------------------------------------
// NATO / APP-6 style unit symbols
// ---------------------------------------------------------------------------
export type Affiliation = 'friend' | 'hostile' | 'neutral' | 'ally';

const AFF_FILL: Record<Affiliation, string> = {
  friend: '#80c8f0',
  ally: '#9ee6c8',
  hostile: '#ff8a80',
  neutral: '#b5f0a0',
};

interface Box { x0: number; y0: number; x1: number; y1: number }

function glyph(cat: UnitCategory, b: Box): string {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const w = b.x1 - b.x0;
  const hh = b.y1 - b.y0;
  const txt = (t: string, size = 9): string =>
    `<text x="${cx}" y="${cy + size * 0.36}" font-size="${size}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" text-anchor="middle" fill="#000" stroke="none">${t}</text>`;
  switch (cat) {
    case UnitCategory.Infantry:
      return `<path d="M${b.x0} ${b.y0}L${b.x1} ${b.y1}M${b.x1} ${b.y0}L${b.x0} ${b.y1}"/>`;
    case UnitCategory.Mechanized:
      return `<path d="M${b.x0} ${b.y0}L${b.x1} ${b.y1}M${b.x1} ${b.y0}L${b.x0} ${b.y1}"/><ellipse cx="${cx}" cy="${cy}" rx="${w * 0.32}" ry="${hh * 0.26}" fill="none"/>`;
    case UnitCategory.Armor:
      return `<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.34}" ry="${hh * 0.27}" fill="none"/>`;
    case UnitCategory.Artillery:
      return `<circle cx="${cx}" cy="${cy}" r="${hh * 0.16}" fill="#000"/>`;
    case UnitCategory.RocketArtillery:
      return `<circle cx="${cx}" cy="${cy + hh * 0.12}" r="${hh * 0.13}" fill="#000"/><path d="M${cx - 4} ${cy - hh * 0.12}l4 -4 4 4M${cx - 4} ${cy - hh * 0.28 + 6}l4 -4 4 4" fill="none"/>`;
    case UnitCategory.AirDefense:
      return `<path d="M${b.x0 + w * 0.1} ${b.y1}Q${cx} ${b.y1 - hh * 0.9} ${b.x1 - w * 0.1} ${b.y1}" fill="none"/><circle cx="${cx}" cy="${cy + hh * 0.05}" r="${hh * 0.11}" fill="#000"/>`;
    case UnitCategory.Recon:
      return `<path d="M${b.x0} ${b.y1}L${b.x1} ${b.y0}"/>`;
    case UnitCategory.SpecialForces:
      return txt('SF');
    case UnitCategory.Engineers:
      return `<path d="M${cx - w * 0.25} ${cy + 4}V${cy - 3}H${cx + w * 0.25}V${cy + 4}M${cx} ${cy - 3}V${cy + 4}" fill="none"/>`;
    case UnitCategory.MissileLauncher:
      return `<path d="M${cx} ${cy - hh * 0.36}l2.4 3.5v${hh * 0.55}h-4.8v-${hh * 0.55}z" fill="#000"/><path d="M${cx - 5} ${cy + hh * 0.34}h10" />`;
    case UnitCategory.Fighter: return txt('F');
    case UnitCategory.Multirole: return txt('F/A', 8);
    case UnitCategory.Strike: return txt('A');
    case UnitCategory.Bomber: return txt('B');
    case UnitCategory.Helicopter:
      return `<path d="M${cx - 8} ${cy - 3.5}L${cx + 8} ${cy + 3.5}V${cy - 3.5}L${cx - 8} ${cy + 3.5}z" fill="#000"/>`;
    case UnitCategory.AirTransport: return txt('C');
    case UnitCategory.Drone:
      return `<path d="M${cx - 8} ${cy - 3}L${cx} ${cy + 4}L${cx + 8} ${cy - 3}L${cx} ${cy}z" fill="#000"/>`;
    case UnitCategory.PatrolBoat: return txt('PB', 8);
    case UnitCategory.Frigate: return txt('FF', 8);
    case UnitCategory.Destroyer: return txt('DD', 8);
    case UnitCategory.Cruiser: return txt('CG', 8);
    case UnitCategory.Carrier: return txt('CV', 8);
    case UnitCategory.Submarine: return txt('SS', 8);
    case UnitCategory.Amphibious: return txt('LH', 8);
  }
  return '';
}

const natoCache = new Map<string, string>();

/** NATO-style symbol for a unit category. `w` is CSS width in px (aspect 4:3). */
export function natoSymbol(cat: UnitCategory, aff: Affiliation = 'friend', w = 28): string {
  const key = `${cat}|${aff}|${w}`;
  const cached = natoCache.get(key);
  if (cached) return cached;
  const cls = CATEGORY_CLASS[cat];
  const fill = AFF_FILL[aff];
  let frame: string;
  let box: Box;
  const hostile = aff === 'hostile';
  if (hostile) {
    frame = `<path d="M20 2L38 15 20 28 2 15z" fill="${fill}"/>`;
    box = { x0: 11, y0: 9.5, x1: 29, y1: 20.5 };
  } else if (cls === UnitClass.Land) {
    frame = `<rect x="3" y="5" width="34" height="20" fill="${fill}"/>`;
    box = { x0: 3, y0: 5, x1: 37, y1: 25 };
  } else if (cls === UnitClass.Air) {
    frame = `<path d="M4 26V15A16 11 0 0136 15V26z" fill="${fill}"/>`;
    box = { x0: 9, y0: 10, x1: 31, y1: 25 };
  } else if (cat === UnitCategory.Submarine) {
    frame = `<path d="M5 6h30v4a15 14 0 01-30 0z" fill="${fill}"/>`;
    box = { x0: 10, y0: 6, x1: 30, y1: 19 };
  } else {
    frame = `<circle cx="20" cy="15" r="12" fill="${fill}"/>`;
    box = { x0: 12, y0: 9, x1: 28, y1: 21 };
  }
  if (aff === 'neutral' && !hostile) {
    frame = `<rect x="6" y="3" width="28" height="24" fill="${fill}"/>`;
    box = { x0: 8, y0: 6, x1: 32, y1: 24 };
  }
  const svg = `<svg class="sc-nato" viewBox="0 0 40 30" width="${w}" height="${(w * 0.75).toFixed(1)}" stroke="#000" stroke-width="1.4" fill="none" stroke-linejoin="round">${frame}${glyph(cat, box)}</svg>`;
  natoCache.set(key, svg);
  return svg;
}

// ---------------------------------------------------------------------------
// Facility icons (monochrome on a coloured tile)
// ---------------------------------------------------------------------------
const FAC_GLYPH: Record<FacilityType, IconName> = {
  [FacilityType.Farm]: 'hexes',
  [FacilityType.Plantation]: 'hexes',
  [FacilityType.LumberMill]: 'mountain',
  [FacilityType.OilWell]: 'fuel',
  [FacilityType.OffshorePlatform]: 'anchor',
  [FacilityType.CoalMine]: 'spade',
  [FacilityType.OreMine]: 'gem',
  [FacilityType.UraniumMine]: 'nuke',
  [FacilityType.PowerPlant]: 'factory',
  [FacilityType.NuclearPlant]: 'nuke',
  [FacilityType.HydroDam]: 'sun',
  [FacilityType.RenewablePlant]: 'sun',
  [FacilityType.ConsumerFactory]: 'box',
  [FacilityType.IndustrialPlant]: 'gear',
  [FacilityType.MilitaryFactory]: 'ammo',
  [FacilityType.ResearchLab]: 'flask',
  [FacilityType.Barracks]: 'helmet',
  [FacilityType.Airbase]: 'runway',
  [FacilityType.NavalBase]: 'anchor',
  [FacilityType.MissileSilo]: 'target',
  [FacilityType.SupplyDepot]: 'truck',
  [FacilityType.RadarStation]: 'radar',
};

/** Resource index a facility produces, used to pick an icon when available. */
const FAC_RES: Partial<Record<FacilityType, Resource>> = {
  [FacilityType.Farm]: Resource.Agriculture,
  [FacilityType.Plantation]: Resource.Rubber,
  [FacilityType.LumberMill]: Resource.Timber,
  [FacilityType.OilWell]: Resource.Petroleum,
  [FacilityType.OffshorePlatform]: Resource.Petroleum,
  [FacilityType.CoalMine]: Resource.Coal,
  [FacilityType.OreMine]: Resource.MetalOre,
  [FacilityType.UraniumMine]: Resource.Uranium,
  [FacilityType.PowerPlant]: Resource.ElectricPower,
  [FacilityType.NuclearPlant]: Resource.ElectricPower,
  [FacilityType.HydroDam]: Resource.ElectricPower,
  [FacilityType.RenewablePlant]: Resource.ElectricPower,
  [FacilityType.ConsumerFactory]: Resource.ConsumerGoods,
  [FacilityType.IndustrialPlant]: Resource.IndustryGoods,
  [FacilityType.MilitaryFactory]: Resource.MilitaryGoods,
};

export function facilityIcon(t: FacilityType): string {
  const r = FAC_RES[t];
  if (r !== undefined && t !== FacilityType.NuclearPlant && t !== FacilityType.HydroDam && t !== FacilityType.RenewablePlant && t !== FacilityType.OffshorePlatform)
    return resourceIcon(r);
  return icon(FAC_GLYPH[t] ?? 'factory');
}

// News category icons
export const NEWS_ICON: Record<string, IconName> = {
  war: 'swords',
  diplomacy: 'handshake',
  economy: 'chart',
  military: 'star',
  event: 'exclaim',
  research: 'flask',
  politics: 'podium',
};

// Treaty icons
export const TREATY_ICON: Record<string, IconName> = {
  embassy: 'embassy',
  trade: 'trade',
  mapSharing: 'map',
  militaryAccess: 'road',
  nonAggression: 'shieldCheck',
  defensePact: 'defensive',
  alliance: 'link',
  researchSharing: 'flask',
  ceasefire: 'whiteFlag',
};
