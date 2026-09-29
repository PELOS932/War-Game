/**
 * UI glue for the 3D design thumbnails (src/render/thumbnails.ts): returns
 * an HTML snippet holding the rendered model image when it is ready, or the
 * NATO symbol as a placeholder. Placeholders carry `data-thumb` and are
 * swapped in place (just that element) when the thumbnail finishes.
 */
import { getDesignThumbnail, getFacilityThumbnail, facilityThumbKey, hintDesignCategory, onThumbnailReady, ThumbSize } from '../render/thumbnails';
import { UnitCategory, FacilityType } from '../sim/types';
import { natoSymbol, facilityIcon, Affiliation } from './icons';

export interface ThumbOpts {
  /** Box size in CSS px (default 48×32). */
  w?: number;
  h?: number;
  /** Source resolution (default: 'lg' when the box is wider than 64px). */
  size?: ThumbSize;
  /** Affiliation shown as a coloured underline (and used for the placeholder symbol). */
  aff?: Affiliation;
}

let hooked = false;

function hook(): void {
  if (hooked) return;
  hooked = true;
  onThumbnailReady((id) => {
    const sel = `.sc-thumb[data-thumb="${CSS.escape(id)}"]`;
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const size = (el.dataset.tsz as ThumbSize | undefined) ?? 'sm';
      const url = getDesignThumbnail(id, size);
      if (!url) return;
      el.removeAttribute('data-thumb');
      el.classList.remove('pending');
      el.innerHTML = `<img src="${url}" alt="" draggable="false">`;
    });
  });
}

/** HTML for a design thumbnail box (3D model image, NATO symbol until ready). */
export function designThumbHTML(design: { id: string; category: UnitCategory }, o: ThumbOpts = {}): string {
  hook();
  const w = o.w ?? 48, hgt = o.h ?? 32;
  const size: ThumbSize = o.size ?? (w > 64 ? 'lg' : 'sm');
  const aff = o.aff ?? 'friend';
  hintDesignCategory(design.id, design.category);
  const url = getDesignThumbnail(design.id, size);
  const cls = `sc-thumb aff-${aff}`;
  const style = `width:${w}px;height:${hgt}px`;
  if (url) return `<span class="${cls}" style="${style}"><img src="${url}" alt="" draggable="false"></span>`;
  const symW = Math.min(w - 4, ((hgt - 2) * 4) / 3);
  return `<span class="${cls} pending" style="${style}" data-thumb="${design.id.replace(/"/g, '&quot;')}" data-tsz="${size}">${natoSymbol(design.category, aff, Math.round(symW))}</span>`;
}

/** Same as `designThumbHTML`, wrapped in a fresh element. */
export function designThumbEl(design: { id: string; category: UnitCategory }, o: ThumbOpts = {}): HTMLElement {
  const tmp = document.createElement('span');
  tmp.innerHTML = designThumbHTML(design, o);
  return tmp.firstElementChild as HTMLElement;
}

/** HTML for a facility-type thumbnail box (3D model image, SVG icon until ready). */
export function facilityThumbHTML(type: FacilityType, o: { w?: number; h?: number; size?: ThumbSize } = {}): string {
  hook();
  const w = o.w ?? 48, hgt = o.h ?? 32;
  const size: ThumbSize = o.size ?? (w > 64 ? 'lg' : 'sm');
  const url = getFacilityThumbnail(type, size);
  const style = `width:${w}px;height:${hgt}px`;
  if (url) return `<span class="sc-thumb fac" style="${style}"><img src="${url}" alt="" draggable="false"></span>`;
  return `<span class="sc-thumb fac pending" style="${style}" data-thumb="${facilityThumbKey(type)}" data-tsz="${size}">${facilityIcon(type)}</span>`;
}
