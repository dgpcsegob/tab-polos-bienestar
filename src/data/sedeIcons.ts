// Íconos por tipo de reunión. Se devuelven como markup para poder usarlos
// tanto en el tooltip de MapLibre (HTML plano) como en el panel de filtros.

export const TIPO_ASAMBLEA = "Asamblea regional";
export const TIPO_MESA = "Mesa de trabajo";

export const SEDE_COLORS: Record<string, string> = {
  // Guinda institucional. El dorado se descartó: lo usan las oficinas INPI
  [TIPO_ASAMBLEA]: "#9b2247",
  [TIPO_MESA]: "#1e5b4f",
};

export const sedeColor = (tipo: string) => SEDE_COLORS[tipo] ?? "#9b2247";

const PATHS: Record<string, string> = {
  // Asamblea regional → grupo de personas
  [TIPO_ASAMBLEA]: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  // Mesa de trabajo → portapapeles con puntos de agenda
  [TIPO_MESA]: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>`,
};

export const sedeIconSvg = (tipo: string, size = 16, color?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color ?? sedeColor(tipo)}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[tipo] ?? PATHS[TIPO_ASAMBLEA]}</svg>`;

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

// Aclara (percent > 0) u oscurece (percent < 0) un color hex, para armar el
// degradado del pin a partir del único tono base por tipo.
const shade = (hex: string, percent: number) => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = clamp255(((num >> 16) & 0xff) + Math.round(2.55 * percent));
  const g = clamp255(((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp255((num & 0xff) + Math.round(2.55 * percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const slug = (tipo: string) => tipo.toLowerCase().replace(/[^a-z]+/g, "-");

// Identificador de la imagen rasterizada del pin, usado como icon-image en
// la capa symbol del mapa. Uno por tipo de reunión.
export const sedePinImageId = (tipo: string) => `sede-pin-${slug(tipo)}`;

// Pin moderno (gota con degradado, brillo superior y sombra) con el glifo del
// tipo de reunión incrustado en un disco blanco. Se rasteriza a data URI para
// poder cargarse como imagen del mapa vía map.addImage.
export const sedePinSvg = (tipo: string) => {
  const base = sedeColor(tipo);
  const light = shade(base, 20);
  const dark = shade(base, -22);
  const glyph = PATHS[tipo] ?? PATHS[TIPO_ASAMBLEA];
  const id = slug(tipo);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="68" height="92" viewBox="0 0 34 46">
    <defs>
      <linearGradient id="pin-grad-${id}" x1="0" y1="0" x2="0.9" y2="1">
        <stop offset="0" stop-color="${light}"/>
        <stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <filter id="pin-shadow-${id}" x="-60%" y="-30%" width="220%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.38"/>
      </filter>
    </defs>
    <g filter="url(#pin-shadow-${id})">
      <path d="M17 0.5C7.9 0.5 0.5 7.9 0.5 17c0 11.4 13.9 26.9 15.6 28.7a1.3 1.3 0 0 0 1.8 0C18.7 43.9 33.5 28.4 33.5 17 33.5 7.9 26.1 0.5 17 0.5z" fill="url(#pin-grad-${id})" stroke="#ffffff" stroke-width="1.4"/>
      <ellipse cx="12.5" cy="9.5" rx="6.5" ry="4" fill="#ffffff" opacity="0.28"/>
      <circle cx="17" cy="16.5" r="10.5" fill="#ffffff"/>
      <g transform="translate(8.7,8.2) scale(0.685)" stroke="${base}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
    </g>
  </svg>`;
};
