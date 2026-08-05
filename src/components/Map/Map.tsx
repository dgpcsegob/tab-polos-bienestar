import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, {
  LngLat,
  LngLatLike,
  Map as MaplibreMap,
  GeoJSONSource,
} from "maplibre-gl";
import { Protocol } from "pmtiles";
import type { Feature, Point, Geometry, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import InfoBox, { InfoBoxSection } from "../InfoBox/InfoBox";
import SedesPanel from "../SedesPanel/SedesPanel";
import { SEDES_LGPI, SedeLGPI } from "../../data/sedesLGPI";
import {
  TIPO_ASAMBLEA,
  TIPO_MESA,
  SEDE_COLORS,
  sedeColor,
  sedeIconSvg,
  sedePinSvg,
  sedePinImageId,
} from "../../data/sedeIcons";

type MapProps = {
  layersVisibility: { [layerId: string]: boolean };
};

// Estado del tooltip flotante de un mapa: su popup, los handlers registrados
// (para poder retirarlos exactamente) y sobre qué se está pasando el cursor.
type HoverState = {
  popup: maplibregl.Popup;
  onMapMouseMove: ((e: maplibregl.MapMouseEvent) => void) | null;
  onMapMoveZoom: () => void;
  onCanvasLeave: () => void;
  hovering: boolean;
  lngLat: maplibregl.LngLat | null;
  /** Firma del conjunto de features bajo el cursor, para no rearmar el HTML */
  lastId: string | number | null;
  /** Clase de tono aplicada al popup por el feature actual */
  claseTono: string | null;
};

// Capa que aporta una ficha al mosaico del tooltip
type TooltipCapa = {
  layerId: string;
  /** Encabezado de la ficha; las sedes traen el suyo dentro del HTML */
  titulo: string | null;
  html: (props: any) => string;
  clase?: (props: any) => string | null;
  /** Color del filo de la ficha dentro del mosaico */
  acento?: (props: any) => string;
  /** Identidad del dato, para no repetir fichas del mismo elemento */
  clave: (f: any) => string;
};

// Tope de fichas simultáneas: más allá el mosaico se vuelve ilegible
const MAX_FICHAS_HOVER = 4;

interface RouteData {
  id: number;
  startPoint: LngLat;
  endPoint: LngLat;
  geometry: Geometry;
  distance: string;
  duration: string;
}

const get3DIcon = (isOn: boolean) => {
  const color = isOn ? "#007cbf" : "#6c757d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// === Sedes de Asambleas y Mesas de Trabajo (LGPI) ===
// El pmtiles de origen trae las geometrías colapsadas en un solo punto sobre el
// Pacífico, así que los puntos se arman aquí con Lat_Sede / Long_Sede.
const SEDES_SOURCE = "sedes_lgpi";
const SEDES_LAYERS = ["sedes_lgpi"];
const SEDES_TOGGLE_ID = "sedesLGPI";
const SEDE_FLY_ZOOM = 16;

// Elige la imagen del pin (ya rasterizada vía map.addImage) según el tipo
const SEDE_ICON_MATCH: any = [
  "match",
  ["get", "tipo"],
  TIPO_ASAMBLEA,
  sedePinImageId(TIPO_ASAMBLEA),
  TIPO_MESA,
  sedePinImageId(TIPO_MESA),
  sedePinImageId(TIPO_ASAMBLEA),
];

const sedesFeatureCollection = () =>
  ({
    type: "FeatureCollection",
    features: SEDES_LGPI.map((s, i) => ({
      type: "Feature",
      // "NO." se repite entre registros, así que el filtrado usa el índice
      id: i,
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { ...s, uid: i },
    })),
  }) as any;

const escapeHtml = (v: any) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );

const ICONO_CALENDARIO = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
// "Monito" de Street View
const ICONO_PEGMAN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2.5"/><path d="M8.5 21v-5.5H7V11a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4.5h-1.5V21"/></svg>`;
const ICONO_PIN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

// El borde izquierdo se pinta en .maplibregl-popup-content, que está por encima
// de la ficha: una variable CSS declarada dentro no lo alcanza, así que el tono
// del tipo de reunión viaja como clase del popup.
const CLASE_POPUP_MESA = "ml-popup-mesa";
const clasePopupSede = (props: any) =>
  String(props?.tipo) === TIPO_MESA ? CLASE_POPUP_MESA : null;

// Ficha compacta: tipo de reunión con ícono, entidad, municipio, fecha y dirección
const buildSedeCard = (props: any) => {
  const tipo = String(props.tipo ?? TIPO_ASAMBLEA);
  const modificador = tipo === TIPO_MESA ? " sede-card--mesa" : "";
  return `<div class="sede-card${modificador}" style="--sede-color:${sedeColor(tipo)}">
      <div class="sede-tipo">${sedeIconSvg(tipo, 15, "currentColor")}<span>${escapeHtml(tipo)}</span></div>
      <div class="sede-municipio">${escapeHtml(props.sede)}</div>
      <div class="sede-entidad">${escapeHtml(props.entidad)}</div>
      <div class="sede-dato"><span class="sede-ico">${ICONO_CALENDARIO}</span>${escapeHtml(props.fecha)}</div>
      <div class="sede-dato"><span class="sede-ico">${ICONO_PIN}</span><span>${escapeHtml(props.direccion)}</span></div>
    </div>`;
};

// Tamaño lógico del pin de sede a icon-size 1 (coincide con el viewBox de
// sedePinSvg). El ancla del icono es su punta inferior, así que el pin entero
// "cuelga" hacia arriba desde la coordenada de la sede.
const PIN_LOGICAL_W = 34;
const PIN_LOGICAL_H = 46;
// Escalón de resalte al pasar el cursor sobre un pin
const PIN_HOVER_SCALE = 1.18;

// Paradas de la interpolación de icon-size de la capa "sedes_lgpi": deben
// coincidir para poder calcular en JS cuánto ocupa el pin en píxeles a un
// zoom dado (y así separar el tooltip del cuerpo del pin).
const SEDE_ICON_SIZE_STOPS: [number, number][] = [
  [4, 0.55],
  [10, 0.78],
  [14, 0.95],
  [18, 1.15],
];

const sedeIconScaleAtZoom = (zoom: number) => {
  const stops = SEDE_ICON_SIZE_STOPS;
  if (zoom <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (zoom >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, s0] = stops[i];
    const [z1, s1] = stops[i + 1];
    if (zoom >= z0 && zoom <= z1) return s0 + (s1 - s0) * ((zoom - z0) / (z1 - z0));
  }
  return last[1];
};

// El estilo sólo permite que "zoom" sea la entrada directa de un
// "interpolate"/"step" de nivel superior: no se puede envolver ese
// interpolate en otra expresión (p.ej. "*") para aplicarle el factor de
// hover. En cambio, cada parada de zoom lleva su propio "case".
// Ojo: "feature-state" no está soportado en propiedades layout (icon-size lo
// es), así que el hover viaja como propiedad normal del GeoJSON —se
// alterna con setSedeHover()— y se lee con ["get", "hover"], no
// ["feature-state", "hover"].
const SEDE_ICON_SIZE_EXPR: any = [
  "interpolate",
  ["linear"],
  ["zoom"],
  ...SEDE_ICON_SIZE_STOPS.flatMap(([zoom, size]) => [
    zoom,
    [
      "case",
      ["boolean", ["get", "hover"], false],
      size * PIN_HOVER_SCALE,
      size,
    ],
  ]),
];

// Offset del popup por ancla: mantiene el tooltip / ficha siempre por encima
// (o a un lado, sin traslape) del cuerpo del pin, que crece hacia arriba
// desde el punto de la sede.
const sedePopupOffset = (
  zoom: number,
  gap = 6,
): { [key in maplibregl.PositionAnchor]: [number, number] } => {
  const scale = sedeIconScaleAtZoom(zoom);
  const w = PIN_LOGICAL_W * scale;
  const h = PIN_LOGICAL_H * scale;
  return {
    center: [0, -h / 2],
    top: [0, gap],
    "top-left": [gap, gap],
    "top-right": [-gap, gap],
    bottom: [0, -(h + gap)],
    "bottom-left": [w / 2 + gap, -(h + gap)],
    "bottom-right": [-(w / 2 + gap), -(h + gap)],
    left: [w / 2 + gap, -h / 2],
    right: [-(w / 2 + gap), -h / 2],
  };
};

// Radio que crece con el zoom: con un valor fijo el punto conserva su tamaño en
// píxeles mientras el mapa se agranda, y se percibe cada vez más chico.
const radioPorZoom = (
  base: number,
  medio: number,
  alto: number,
  maximo: number,
): any => [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  base,
  8,
  medio,
  12,
  alto,
  16,
  maximo,
];

// Registra las imágenes del pin de sede bajo demanda: MapLibre dispara
// "styleimagemissing" la primera vez que una capa symbol referencia un
// icon-image aún no cargado, y de nuevo tras cada cambio de estilo (el
// estilo nuevo no hereda las imágenes del anterior).
const ensureSedeIconLoader = (
  map: MaplibreMap,
  attached: WeakSet<MaplibreMap>,
) => {
  if (attached.has(map)) return;
  attached.add(map);
  map.on("styleimagemissing", (e) => {
    const { id } = e;
    if (id !== sedePinImageId(TIPO_ASAMBLEA) && id !== sedePinImageId(TIPO_MESA))
      return;
    const tipo = id === sedePinImageId(TIPO_MESA) ? TIPO_MESA : TIPO_ASAMBLEA;
    const img = new Image();
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, { pixelRatio: 2 });
    };
    img.src = `data:image/svg+xml;base64,${btoa(sedePinSvg(tipo))}`;
  });
};

// Marca/desmarca la propiedad "hover" de una sede en su GeoJSON y reenvía los
// datos a la fuente: icon-size (layout) no admite feature-state, así que el
// resalte al pasar el cursor viaja como propiedad normal (["get","hover"]).
// El índice del arreglo coincide con el "id" de cada feature (ver
// sedesFeatureCollection), así que se accede directo sin buscar.
const setSedeHover = (
  map: MaplibreMap,
  hoverIdRef: WeakMap<MaplibreMap, number | null>,
  dataRef: WeakMap<MaplibreMap, GeoJSON.FeatureCollection>,
  newId: number | null,
) => {
  const prevId = hoverIdRef.get(map) ?? null;
  if (prevId === newId) return;
  hoverIdRef.set(map, newId);

  const data = dataRef.get(map);
  const source = map.getSource(SEDES_SOURCE) as GeoJSONSource | undefined;
  if (!data || !source) return;
  if (prevId != null && data.features[prevId])
    (data.features[prevId].properties as any).hover = false;
  if (newId != null && data.features[newId])
    (data.features[newId].properties as any).hover = true;
  source.setData(data);
};

// Aceleración y frenado suaves; evita el arranque brusco del easing por omisión
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Hasta dónde se puede desplazar el visor. Tiene que CONTENER a MEXICO_VIEW:
// si es más chico, MapLibre recorta el encuadre de arranque a este límite y
// ampliar la vista no surte efecto.
const MEXICO_BOUNDS: [[number, number], [number, number]] = [
  [-125, 8],
  [-79, 38],
];

// Encuadre de arranque: el mapa se abre con fitBounds sobre esta extensión, no
// con un zoom fijo, para que llene la pantalla sea cual sea el tamaño de la
// ventana. Asoma el sur de Estados Unidos por arriba y Honduras por el sureste.
const MEXICO_VIEW: [[number, number], [number, number]] = [
  [-121, 12],
  [-84, 34],
];

// Aire alrededor del encuadre inicial: deja respirar el panel de capas
// (izquierda), el dock de herramientas (derecha) y el minimapa (abajo).
const MEXICO_VIEW_PADDING = { top: 40, bottom: 70, left: 150, right: 140 };

// El minimapa conserva un encuadre ceñido al país: si usara el límite de paneo
// del visor, la república se vería diminuta dentro del recuadro.
const MINIMAP_BOUNDS: [[number, number], [number, number]] = [
  [-120, 14],
  [-84, 33.5],
];

// === Minimapa: panorama fijo, nunca cambia de zoom ===
const MINIMAP_FIXED_CENTER: [number, number] = [-101.14765, 23.33676];
// Zoom provisional; al cargar se ajusta con fitBounds para que entre todo México
const MINIMAP_FIXED_ZOOM = 2;
// Por debajo de este tamaño el recuadro es ilegible → se marca con un punto
const MINIMAP_MIN_RECT_PX = 14;

const EMPTY_FEATURES = {
  type: "FeatureCollection" as const,
  features: [],
};

const addMinimapIndicatorLayers = (minimap: MaplibreMap) => {
  // Encuadra toda la república una sola vez; a partir de aquí el minimapa
  // ya no cambia de centro ni de zoom.
  minimap.fitBounds(MINIMAP_BOUNDS, { padding: 6, animate: false });

  minimap.addSource("viewport-bounds", {
    type: "geojson",
    data: EMPTY_FEATURES,
  });
  minimap.addSource("viewport-marker", {
    type: "geojson",
    data: EMPTY_FEATURES,
  });

  minimap.addLayer({
    id: "viewport-bounds-fill",
    type: "fill",
    source: "viewport-bounds",
    paint: { "fill-color": "#9b2247", "fill-opacity": 0.18 },
  });
  minimap.addLayer({
    id: "viewport-bounds-outline",
    type: "line",
    source: "viewport-bounds",
    paint: { "line-color": "#9b2247", "line-width": 2 },
  });

  // Punto que sustituye al recuadro cuando el zoom principal es alto
  minimap.addLayer({
    id: "viewport-marker-halo",
    type: "circle",
    source: "viewport-marker",
    paint: {
      "circle-radius": 9,
      "circle-color": "#9b2247",
      "circle-opacity": 0.18,
      "circle-stroke-color": "#9b2247",
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.5,
    },
  });
  minimap.addLayer({
    id: "viewport-marker-dot",
    type: "circle",
    source: "viewport-marker",
    paint: {
      "circle-radius": 4,
      "circle-color": "#9b2247",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
};

// Marca en el minimapa dónde está el mapa principal, sin alterar su zoom.
const syncMinimapIndicator = (
  minimap: MaplibreMap | null,
  mainMap: MaplibreMap,
) => {
  if (!minimap) return;
  const boundsSource = minimap.getSource("viewport-bounds") as
    | GeoJSONSource
    | undefined;
  const markerSource = minimap.getSource("viewport-marker") as
    | GeoJSONSource
    | undefined;
  if (!boundsSource || !markerSource) return;

  const bounds = mainMap.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // Tamaño que tendría el recuadro en píxeles del minimapa
  const pSW = minimap.project(sw);
  const pNE = minimap.project(ne);
  const rectW = Math.abs(pNE.x - pSW.x);
  const rectH = Math.abs(pSW.y - pNE.y);

  // Normalmente se dibuja el recuadro; sólo con el mapa principal muy acercado
  // se reduce a un punto que no sería legible como rectángulo.
  if (Math.min(rectW, rectH) < MINIMAP_MIN_RECT_PX) {
    const center = mainMap.getCenter();
    boundsSource.setData(EMPTY_FEATURES);
    markerSource.setData({
      type: "Feature",
      geometry: { type: "Point", coordinates: [center.lng, center.lat] },
      properties: {},
    } as Feature<Point>);
    return;
  }

  const boundsPolygon: Feature<Polygon> = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          bounds.getSouthWest().toArray(),
          bounds.getNorthWest().toArray(),
          bounds.getNorthEast().toArray(),
          bounds.getSouthEast().toArray(),
          bounds.getSouthWest().toArray(),
        ],
      ],
    },
    properties: {},
  };
  markerSource.setData(EMPTY_FEATURES);
  boundsSource.setData(boundsPolygon);
};

const Map: React.FC<MapProps> = ({ layersVisibility }) => {
  const mapRef = useRef<MaplibreMap | null>(null);
  const minimapRef = useRef<MaplibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);

  // === Split view refs ===
  const splitMapRef = useRef<MaplibreMap | null>(null);
  const splitMinimapRef = useRef<MaplibreMap | null>(null);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const splitMinimapContainerRef = useRef<HTMLDivElement | null>(null);
  const splitBlinkAnimationId = useRef<number | null>(null);

  const animationFrameId = useRef<number | null>(null);
  const blinkAnimationId = useRef<number | null>(null);
  const routeIdCounter = useRef(0);

  // === Hover: un estado completo por instancia de mapa ===
  // El popup lleva la clase '.ml-popup' para el pointer-events:none del CSS.
  const hoverStatesRef = useRef(new WeakMap<MaplibreMap, HoverState>());
  // === Sedes LGPI ===
  // Cada mapa tiene sus propios filtros: el principal y el dividido se manejan
  // por separado para poder comparar dos selecciones lado a lado.
  // null = sin filtro (las 89). Se guarda en refs para poder re-aplicarlo
  // cuando el cambio de estilo (satelital / 3D) vuelve a crear las capas.
  const sedesFilterRef = useRef<number[] | null>(null);
  const sedesFilterSplitRef = useRef<number[] | null>(null);
  const [sedesFiltradas, setSedesFiltradas] = useState<SedeLGPI[]>(SEDES_LGPI);
  const [sedesFiltradasSplit, setSedesFiltradasSplit] =
    useState<SedeLGPI[]>(SEDES_LGPI);
  // Espejo del estado para los handlers del mapa, que se registran una sola vez
  const sedesFiltradasRef = useRef<SedeLGPI[]>(SEDES_LGPI);
  const sedesFiltradasSplitRef = useRef<SedeLGPI[]>(SEDES_LGPI);
  // Distingue el cierre a mano (que devuelve la vista) del cierre por código
  const cierreSilenciosoRef = useRef(false);
  // El handler de click se registra una vez; el encuadre vigente llega por ref
  const encuadrarSedesRef = useRef<
    (map: MaplibreMap | null, sedes: SedeLGPI[]) => void
  >(() => {});
  // Ficha fija que abre el click sobre una sede, una por mapa
  const sedeDetailRef = useRef(new WeakMap<MaplibreMap, maplibregl.Popup>());
  // Handler de click por instancia de mapa (principal y dividido), para poder
  // retirarlo al re-adjuntar los eventos tras un cambio de estilo
  const sedeClickRef = useRef(new WeakMap<MaplibreMap, (e: any) => void>());
  // Mapas que ya tienen el manejador de "styleimagemissing" de los pines
  const sedeIconLoaderRef = useRef(new WeakSet<MaplibreMap>());
  // uid de la sede actualmente resaltada (hover) por mapa
  const sedeHoverIdRef = useRef(new WeakMap<MaplibreMap, number | null>());
  // GeoJSON en uso por la fuente de sedes de cada mapa (para mutar "hover")
  const sedesDataRef = useRef(new WeakMap<MaplibreMap, GeoJSON.FeatureCollection>());
  // El primer render no debe reencuadrar: el mapa ya arranca sobre la república
  const primerEncuadreRef = useRef(true);
  const primerEncuadreSplitRef = useRef(true);

  // === Brújula ===
  const [displayBearing, setDisplayBearing] = useState(0);
  const displayBearingRef = useRef(0);
  const compassAnimId = useRef<number | null>(null);

  const apiKey = "QAha5pFBxf4hGa8Jk5zv";
  const baseStyleUrl = "https://www.mapabase.atdt.gob.mx/style_white_3d_places.json";
  const base3DStyleUrl = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${apiKey}`;
  const satelliteStyleUrl = `https://api.maptiler.com/maps/satellite/style.json?key=${apiKey}`;
  const minimapStyleUrl = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${apiKey}`;

  const [isSatellite, setIsSatellite] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isMeasuringLine, setIsMeasuringLine] = useState(false);
  const [is3D, setIs3D] = useState(false);

  // === Split view state ===
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitWidth, setSplitWidth] = useState(50); // Porcentaje del ancho para el mapa principal
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  // === Split map independent controls ===
  const [splitIsSatellite, setSplitIsSatellite] = useState(false);
  const [splitIsMeasuring, setSplitIsMeasuring] = useState(false);
  const [splitIsMeasuringLine, setSplitIsMeasuringLine] = useState(false);
  const [splitIs3D, setSplitIs3D] = useState(false);
  const [splitDisplayBearing, setSplitDisplayBearing] = useState(0);
  const splitDisplayBearingRef = useRef(0);
  const splitCompassAnimId = useRef<number | null>(null);

  // === Split map layer visibility (independent) ===
  const [splitLayersVisibility, setSplitLayersVisibility] = useState<{
    [layerId: string]: boolean;
  }>({});

  const [currentPoints, setCurrentPoints] = useState<LngLatLike[]>([]);
  const [currentLinePoints, setCurrentLinePoints] = useState<LngLatLike[]>([]);
  const [routesData, setRoutesData] = useState<RouteData[]>([]);
  const [linesData, setLinesData] = useState<RouteData[]>([]);

  // Mediciones del mapa dividido, independientes de las del principal
  const [splitCurrentPoints, setSplitCurrentPoints] = useState<LngLatLike[]>([]);
  const [splitCurrentLinePoints, setSplitCurrentLinePoints] = useState<
    LngLatLike[]
  >([]);
  const [splitRoutesData, setSplitRoutesData] = useState<RouteData[]>([]);
  const [splitLinesData, setSplitLinesData] = useState<RouteData[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mapView, setMapView] = useState<number>(0); // Solo setMapView se usa para forzar re-renders

  const isMeasuringRef = useRef(isMeasuring);
  const isMeasuringLineRef = useRef(isMeasuringLine);
  isMeasuringRef.current = isMeasuring;
  isMeasuringLineRef.current = isMeasuringLine;
  const splitIsMeasuringRef = useRef(splitIsMeasuring);
  const splitIsMeasuringLineRef = useRef(splitIsMeasuringLine);
  splitIsMeasuringRef.current = splitIsMeasuring;
  splitIsMeasuringLineRef.current = splitIsMeasuringLine;

  // Todas las funciones de medición reciben el mapa: el principal y el dividido
  // corren el mismo circuito con estados separados.
  const clearCurrentPoints = useCallback((map: MaplibreMap | null) => {
    if (!map) return;
    const layers = [
      "start-point-current",
      "start-point-current-pulse",
      "end-point-current",
      "end-point-current-pulse",
      "start-point-line-current",
      "start-point-line-current-pulse",
      "end-point-line-current",
      "end-point-line-current-pulse",
    ];
    const sources = [
      "start-point-current",
      "end-point-current",
      "start-point-line-current",
      "end-point-line-current",
    ];
    layers.forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    sources.forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }, []);

  const drawSingleRouteOnMap = useCallback(
    (map: MaplibreMap, route: RouteData) => {
      const { id, startPoint, endPoint, geometry } = route;
      if (map.getSource(`route-source-${id}`)) return;

      map.addSource(`route-source-${id}`, {
        type: "geojson",
        data: { type: "Feature", geometry, properties: {} },
      });

      map.addLayer({
        id: `route-layer-${id}`,
        type: "line",
        source: `route-source-${id}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#007cbf",
          "line-width": 5,
          "line-opacity": 0.8,
        },
      });

      map.addSource(`start-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [startPoint.lng, startPoint.lat] },
      });
      map.addLayer({
        id: `start-point-${id}`,
        type: "circle",
        source: `start-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#007cbf",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addSource(`end-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [endPoint.lng, endPoint.lat] },
      });
      map.addLayer({
        id: `end-point-${id}`,
        type: "circle",
        source: `end-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#007cbf",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    },
    [],
  );

  const drawSingleLineOnMap = useCallback(
    (map: MaplibreMap, line: RouteData) => {
      const { id, startPoint, endPoint } = line;
      if (map.getSource(`line-source-${id}`)) return;

      const lineGeometry = {
        type: "LineString" as const,
        coordinates: [
          [startPoint.lng, startPoint.lat],
          [endPoint.lng, endPoint.lat],
        ],
      };

      map.addSource(`line-source-${id}`, {
        type: "geojson",
        data: { type: "Feature", geometry: lineGeometry, properties: {} },
      });
      map.addLayer({
        id: `line-layer-${id}`,
        type: "line",
        source: `line-source-${id}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ff6b35",
          "line-width": 4,
          "line-opacity": 0.8,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource(`start-line-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [startPoint.lng, startPoint.lat] },
      });
      map.addLayer({
        id: `start-line-point-${id}`,
        type: "circle",
        source: `start-line-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff6b35",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addSource(`end-line-point-${id}`, {
        type: "geojson",
        data: { type: "Point", coordinates: [endPoint.lng, endPoint.lat] },
      });
      map.addLayer({
        id: `end-line-point-${id}`,
        type: "circle",
        source: `end-line-point-${id}`,
        paint: {
          "circle-radius": 6,
          "circle-color": "#ff6b35",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    },
    [],
  );

  const borrarMediciones = useCallback(
    (
      map: MaplibreMap | null,
      routesData: RouteData[],
      linesData: RouteData[],
    ) => {
      if (!map) return;

      routesData.forEach((route) => {
      const { id } = route;
      if (map.getLayer(`route-layer-${id}`))
        map.removeLayer(`route-layer-${id}`);
      if (map.getSource(`route-source-${id}`))
        map.removeSource(`route-source-${id}`);
      if (map.getLayer(`start-point-${id}`))
        map.removeLayer(`start-point-${id}`);
      if (map.getSource(`start-point-${id}`))
        map.removeSource(`start-point-${id}`);
      if (map.getLayer(`end-point-${id}`)) map.removeLayer(`end-point-${id}`);
      if (map.getSource(`end-point-${id}`)) map.removeSource(`end-point-${id}`);
    });

    linesData.forEach((line) => {
      const { id } = line;
      if (map.getLayer(`line-layer-${id}`)) map.removeLayer(`line-layer-${id}`);
      if (map.getSource(`line-source-${id}`))
        map.removeSource(`line-source-${id}`);
      if (map.getLayer(`start-line-point-${id}`))
        map.removeLayer(`start-line-point-${id}`);
      if (map.getSource(`start-line-point-${id}`))
        map.removeSource(`start-line-point-${id}`);
      if (map.getLayer(`end-line-point-${id}`))
        map.removeLayer(`end-line-point-${id}`);
      if (map.getSource(`end-line-point-${id}`))
          map.removeSource(`end-line-point-${id}`);
      });

      clearCurrentPoints(map);
    },
    [clearCurrentPoints],
  );

  const clearAllRoutes = useCallback(() => {
    borrarMediciones(mapRef.current, routesData, linesData);
    setRoutesData([]);
    setLinesData([]);
  }, [routesData, linesData, borrarMediciones]);

  const clearAllRoutesSplit = useCallback(() => {
    borrarMediciones(splitMapRef.current, splitRoutesData, splitLinesData);
    setSplitRoutesData([]);
    setSplitLinesData([]);
  }, [splitRoutesData, splitLinesData, borrarMediciones]);

  const attachAllTooltipEvents = useCallback((map: MaplibreMap) => {
    // Todo el estado del hover vive por instancia de mapa. Cuando era
    // compartido, re-adjuntar los eventos (cambio de estilo, apertura de la
    // vista dividida) dejaba listeners viejos vivos: cada cierre tenía su
    // propio "hovering" y la etiqueta se quedaba clavada donde estuviera.
    const previo = hoverStatesRef.current.get(map);
    if (previo) {
      if (previo.onMapMouseMove) map.off("mousemove", previo.onMapMouseMove);
      map.off("move", previo.onMapMoveZoom);
      map.off("zoom", previo.onMapMoveZoom);
      map.getCanvas().removeEventListener("mouseleave", previo.onCanvasLeave);
      previo.popup.remove();
    }
    // El source se recrea en cada cambio de estilo: cualquier feature-state
    // que se recuerde de antes ya no aplica al source nuevo
    sedeHoverIdRef.current.delete(map);

    // Un popup por mapa: uno compartido se arrancaría del otro al mostrarse
    const popup =
      previo?.popup ??
      new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "ml-popup",
        offset: 8,
        // Ancho suficiente para el mosaico de dos columnas
        maxWidth: "none",
      });

    const estado: HoverState = {
      popup,
      hovering: false,
      lngLat: null,
      lastId: null,
      claseTono: null,
      onMapMoveZoom: () => {},
      onCanvasLeave: () => {},
      onMapMouseMove: null,
    };
    hoverStatesRef.current.set(map, estado);

    // Ojo: addClassName no hace nada si el popup aún no está montado, y su
    // contenedor se recrea en cada addTo. Por eso la clase se reafirma siempre
    // —después de montarlo— en vez de sólo cuando cambia de tipo.
    const aplicarClase = (clase: string | null) => {
      if (estado.claseTono && estado.claseTono !== clase) {
        popup.removeClassName(estado.claseTono);
      }
      estado.claseTono = clase;
      if (clase) popup.addClassName(clase);
    };

    // === Registro de capas con tooltip ===
    // Un solo manejador consulta todo lo que hay bajo el cursor, en vez de un
    // juego de eventos por capa: así se pueden mostrar varias fichas a la vez.
    const capasTooltip: TooltipCapa[] = [
      ...["regiones_zona1", "regiones_zona2"].map((layerId) => ({
        layerId,
        titulo: "Región de Paz",
        html: (props: any) =>
          `<strong>Entidad:</strong> ${props._NOM_ENT ?? props.NOM_ENT ?? "N/A"}<br/>
           <strong>Municipio:</strong> ${props.NOMGEO ?? props.NOM_MUN ?? "N/A"}<br/>
           <strong>Región:</strong> ${props._REGION ?? "N/A"}<br/>
           <strong>Nombre:</strong> ${props._NOM_REGION ?? "N/A"}`,
        clave: (f: any) =>
          `region-${f.properties?._REGION ?? ""}-${f.properties?.NOMGEO ?? ""}`,
      })),
      {
        layerId: "PresidenciasMunicipales",
        titulo: "Cabecera Municipal",
        html: (props: any) =>
          `<strong>Entidad:</strong> ${props.NOM_ENT ?? props.entidad ?? ""}<br/>
           <strong>Municipio:</strong> ${props.NOM_MUN ?? props.municipio ?? ""}<br/>
           <strong>Dirección:</strong> ${props.direccion ?? ""}`,
        clave: (f: any) =>
          `presidencia-${f.id ?? f.properties?.NOM_MUN ?? ""}`,
      },
      {
        layerId: "LocalidadesSedeINPI",
        titulo: "Pueblo Indígena",
        html: (props: any) =>
          `<strong>Entidad:</strong> ${props.NOM_ENT ?? ""}<br/>
           <strong>Municipio:</strong> ${props.NOM_MUN ?? ""}<br/>
           <strong>Localidad:</strong> ${props.NOM_LOC ?? ""}<br/>
           <strong>Pueblo:</strong> ${props.Pueblo ?? ""}`,
        clave: (f: any) => `inpi-${f.id ?? f.properties?.NOM_LOC ?? ""}`,
      },
      // El punto y su halo son dos capas del mismo dato: la clave las unifica
      ...SEDES_LAYERS.map((layerId) => ({
        layerId,
        titulo: null,
        html: (props: any) => buildSedeCard(props),
        clase: clasePopupSede,
        acento: (props: any) => sedeColor(String(props?.tipo)),
        clave: (f: any) => `sede-${f.properties?.uid}`,
      })),
    ];

    // Objeto plano y no un Map: el nombre Map lo ocupa este componente
    const porCapa: Record<string, TooltipCapa> = {};
    capasTooltip.forEach((c) => {
      porCapa[c.layerId] = c;
    });

    // Cada mapa tiene su propio modo de medición
    const midiendo = () =>
      map === splitMapRef.current
        ? splitIsMeasuringRef.current || splitIsMeasuringLineRef.current
        : isMeasuringRef.current || isMeasuringLineRef.current;

    // Al medir, el cursor es una cruz: el tooltip no debe pisarla, porque
    // ocultar() ahora corre en cada movimiento sobre zona vacía.
    const cursorEnReposo = () => (midiendo() ? "crosshair" : "");

    const ocultar = () => {
      map.getCanvas().style.cursor = cursorEnReposo();
      estado.hovering = false;
      estado.lngLat = null;
      estado.lastId = null;
      aplicarClase(null);
      popup.remove();
      setSedeHover(map, sedeHoverIdRef.current, sedesDataRef.current, null);
    };

    estado.onMapMouseMove = (e: maplibregl.MapMouseEvent) => {
      const ids = capasTooltip
        .map((c) => c.layerId)
        .filter((id) => map.getLayer(id));
      if (!ids.length) return ocultar();

      // queryRenderedFeatures respeta la visibilidad y los filtros vigentes
      const encontrados = map.queryRenderedFeatures(e.point, { layers: ids });
      if (!encontrados.length) return ocultar();

      // Una ficha por dato: se descartan los duplicados (punto + halo, o el
      // mismo polígono partido entre teselas)
      const vistos = new Set<string>();
      const fichas: string[] = [];
      let clase: string | null = null;
      // Feature de sede bajo el cursor (si hay), para resaltar su pin y
      // separar el tooltip del cuerpo del pin
      let sedeFeature: any = null;

      for (const f of encontrados) {
        const capa = porCapa[f.layer.id];
        if (!capa) continue;
        const clave = capa.clave(f);
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        if (SEDES_LAYERS.includes(f.layer.id) && !sedeFeature) sedeFeature = f;
        if (fichas.length >= MAX_FICHAS_HOVER) continue;

        const props = f.properties ?? {};
        clase = clase ?? capa.clase?.(props) ?? null;
        const acento = capa.acento?.(props);
        fichas.push(
          `<div class="tt-item"${acento ? ` style="--tt-acento:${acento}"` : ""}>${
            capa.titulo ? `<div class="tt-item-tipo">${capa.titulo}</div>` : ""
          }${capa.html(props)}</div>`,
        );
      }

      if (!fichas.length) return ocultar();

      setSedeHover(
        map,
        sedeHoverIdRef.current,
        sedesDataRef.current,
        sedeFeature ? (sedeFeature.id as number) : null,
      );
      popup.setOffset(sedeFeature ? sedePopupOffset(map.getZoom()) : 8);

      const ocultas = vistos.size - fichas.length;
      const firma = Array.from(vistos).join("|");

      map.getCanvas().style.cursor = cursorEnReposo() || "pointer";

      // Sólo se reconstruye el HTML si cambió el conjunto bajo el cursor
      if (estado.lastId !== firma) {
        estado.lastId = firma;
        popup.setHTML(
          `<div class="tt-mosaico" data-n="${fichas.length}">${fichas.join("")}${
            ocultas > 0
              ? `<div class="tt-mas">+${ocultas} más en este punto</div>`
              : ""
          }</div>`,
        );
      }

      estado.hovering = true;
      estado.lngLat = e.lngLat;
      // Posicionar en el acto: diferirlo a un requestAnimationFrame era lo
      // que dejaba la etiqueta rezagada respecto del cursor.
      popup.setLngLat(e.lngLat);
      if (!popup.isOpen()) popup.addTo(map);
      // Ya montado: hasta aquí no existe el contenedor que recibe la clase.
      // Con varias fichas el tono se deja neutro; cada una lleva el suyo.
      aplicarClase(fichas.length === 1 ? clase : null);
    };
    map.on("mousemove", estado.onMapMouseMove);

    // El popup no se cierra al desplazar o hacer zoom: sigue anclado a su punto
    estado.onMapMoveZoom = () => {
      if (!estado.hovering || !estado.lngLat) return;
      // El pin cambia de tamaño con el zoom: el offset se recalcula para
      // seguir despegado de su cuerpo mientras se hace scroll-zoom en hover
      if (sedeHoverIdRef.current.get(map) != null) {
        popup.setOffset(sedePopupOffset(map.getZoom()));
      }
      popup.setLngLat(estado.lngLat);
    };
    map.on("move", estado.onMapMoveZoom);
    map.on("zoom", estado.onMapMoveZoom);

    // Si el mouse sale del canvas, cerramos el popup
    estado.onCanvasLeave = ocultar;
    map.getCanvas().addEventListener("mouseleave", estado.onCanvasLeave);


    // Qué sedes tiene filtradas el mapa sobre el que se está actuando
    const sedesFiltradasDe = (m: MaplibreMap) =>
      m === splitMapRef.current
        ? sedesFiltradasSplitRef.current
        : sedesFiltradasRef.current;

    // === Click en una sede → vuelo al punto + ficha fija con Street View ===
    const abrirDetalleSede = (
      e: maplibregl.MapMouseEvent & { features?: any[] },
    ) => {
      if (midiendo()) return;
      if (!e.features?.length) return;

      const feat = e.features[0];
      const props = feat.properties ?? {};
      const coords = ((feat.geometry as any).coordinates as number[]).slice(
        0,
        2,
      ) as [number, number];

      // El tooltip de hover estorbaría a la ficha fija
      estado.hovering = false;
      estado.lngLat = null;
      estado.lastId = null;
      popup.remove();
      setSedeHover(map, sedeHoverIdRef.current, sedesDataRef.current, null);

      map.flyTo({
        center: coords,
        zoom: SEDE_FLY_ZOOM,
        duration: 2400,
        curve: 1.15,
        easing: easeInOutCubic,
        essential: true,
      });

      const contenedor = document.createElement("div");
      contenedor.innerHTML = buildSedeCard(props);

      // "Monito" de Street View: abre la vista a pie de calle de la sede
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "sede-streetview";
      boton.innerHTML = `${ICONO_PEGMAN}<span>Ver en Street View</span>`;
      boton.addEventListener("click", () => {
        window.open(
          `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${props.lat},${props.lon}`,
          "_blank",
          "noopener,noreferrer",
        );
      });
      contenedor.querySelector(".sede-card")?.appendChild(boton);

      // Reemplazar una ficha por otra no debe contar como cierre a mano
      cierreSilenciosoRef.current = true;
      sedeDetailRef.current.get(map)?.remove();
      cierreSilenciosoRef.current = false;

      const detalle = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        className: ["ml-popup-sede", clasePopupSede(props)]
          .filter(Boolean)
          .join(" "),
        // El vuelo siempre termina en SEDE_FLY_ZOOM: el offset se calcula
        // para ese zoom, así la ficha queda despegada de todo el pin
        offset: sedePopupOffset(SEDE_FLY_ZOOM),
        maxWidth: "300px",
      });
      // Cerrar la ficha a mano deshace el acercamiento: devuelve ese mapa al
      // conjunto de sedes que tenga filtrado en ese momento.
      detalle.on("close", () => {
        if (cierreSilenciosoRef.current) return;
        encuadrarSedesRef.current(map, sedesFiltradasDe(map));
      });
      detalle.setLngLat(coords).setDOMContent(contenedor).addTo(map);
      sedeDetailRef.current.set(map, detalle);
    };

    const prevSedeClick = sedeClickRef.current.get(map);
    if (prevSedeClick) map.off("click", SEDES_LAYERS, prevSedeClick);
    sedeClickRef.current.set(map, abrirDetalleSede);
    map.on("click", SEDES_LAYERS, abrirDetalleSede);
  }, []);

  const addRouteToMap = useCallback(
    async (
      map: MaplibreMap | null,
      points: LngLatLike[],
      setDatos: React.Dispatch<React.SetStateAction<RouteData[]>>,
      setPuntos: React.Dispatch<React.SetStateAction<LngLatLike[]>>,
    ) => {
      if (!map) return;
      const [startPoint, endPoint] = points.map((p) => LngLat.convert(p));
      const startCoords = `${startPoint.lng},${startPoint.lat}`;
      const endCoords = `${endPoint.lng},${endPoint.lat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${startCoords};${endCoords}?overview=full&geometries=geojson`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== "Ok" || data.routes.length === 0)
          throw new Error("No se pudo encontrar una ruta.");
        const route = data.routes[0];
        const distance = (route.distance / 1000).toFixed(2);
        const totalSeconds = route.duration;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.round((totalSeconds % 3600) / 60);
        const durationParts: string[] = [];
        if (hours > 0)
          durationParts.push(`${hours} hora${hours > 1 ? "s" : ""}`);
        if (minutes > 0 || durationParts.length === 0)
          durationParts.push(`${minutes} min`);
        const duration = durationParts.join(" ");
        const newRouteData: RouteData = {
          id: routeIdCounter.current++,
          startPoint,
          endPoint,
          geometry: route.geometry,
          distance,
          duration,
        };
        drawSingleRouteOnMap(map, newRouteData);
        setDatos((prev) => [...prev, newRouteData]);
      } catch (error) {
        console.error("Error al obtener la ruta:", error);
        alert("No se pudo calcular la ruta. Por favor, inténtelo de nuevo.");
      } finally {
        clearCurrentPoints(map);
        setPuntos([]);
      }
    },
    [clearCurrentPoints, drawSingleRouteOnMap],
  );

  const addLineToMap = useCallback(
    (
      map: MaplibreMap | null,
      points: LngLatLike[],
      setDatos: React.Dispatch<React.SetStateAction<RouteData[]>>,
      setPuntos: React.Dispatch<React.SetStateAction<LngLatLike[]>>,
    ) => {
      if (!map) return;
      const [startPoint, endPoint] = points.map((p) => LngLat.convert(p));

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const R = 6371; // km
      const φ1 = toRad(startPoint.lat);
      const φ2 = toRad(endPoint.lat);
      const Δφ = toRad(endPoint.lat - startPoint.lat);
      const Δλ = toRad(endPoint.lng - startPoint.lng);
      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = distanceKm.toFixed(2);

      const newLineData: RouteData = {
        id: routeIdCounter.current++,
        startPoint,
        endPoint,
        geometry: {
          type: "LineString",
          coordinates: [
            [startPoint.lng, startPoint.lat],
            [endPoint.lng, endPoint.lat],
          ],
        },
        distance,
        duration: "Línea recta",
      };

      drawSingleLineOnMap(map, newLineData);
      setDatos((prev) => [...prev, newLineData]);
      clearCurrentPoints(map);
      setPuntos([]);
    },
    [clearCurrentPoints, drawSingleLineOnMap],
  );

  // Deja visibles sólo las sedes que pasan los filtros del panel de ese mapa
  const applySedesFilter = (map: maplibregl.Map) => {
    const uids =
      map === splitMapRef.current
        ? sedesFilterSplitRef.current
        : sedesFilterRef.current;
    const filtro: any =
      uids === null ? null : ["in", ["get", "uid"], ["literal", uids]];
    SEDES_LAYERS.forEach((id) => {
      if (map.getLayer(id)) map.setFilter(id, filtro);
    });
  };

  const addVectorLayers = (map: maplibregl.Map) => {
    const zonas = ["zona1", "zona2"];

    zonas.forEach((zona) => {
      if (!map.getSource(`ofrep_${zona}`)) {
        map.addSource(`ofrep_${zona}`, {
          type: "vector",
          url: `pmtiles://data/or_${zona}.pmtiles`,
        });
      }
      if (!map.getLayer(`ofrep_${zona}`)) {
        map.addLayer({
          id: `ofrep_${zona}`,
          type: "circle",
          source: `ofrep_${zona}`,
          "source-layer": `or_${zona}_tile`,
          paint: {
            "circle-radius": radioPorZoom(4.5, 6, 8.5, 11),
            "circle-color": "#a57f2c",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": radioPorZoom(1.5, 1.6, 1.9, 2.2),
          },
        });
      }
    });

    zonas.forEach((zona) => {
      if (!map.getSource(`regiones_${zona}`)) {
        map.addSource(`regiones_${zona}`, {
          type: "vector",
          url: `pmtiles://data/regiones_${zona}.pmtiles`,
        });
      }
      const colorSet = [
        "#66c2a5",
        "#fc8d62",
        "#8da0cb",
        "#e78ac3",
        "#a6d854",
        "#ffd92f",
        "#e5c494",
        "#b3b3b3",
      ];
      const matchValues: (string | number)[] = [];
      for (let i = 1; i <= 266; i++) {
        matchValues.push(i, colorSet[i % colorSet.length]);
      }
      const matchExpression = [
        "match",
        ["get", "_REGION"],
        ...matchValues,
        "#cccccc",
      ] as any;
      if (!map.getLayer(`regiones_${zona}`)) {
        map.addLayer({
          id: `regiones_${zona}`,
          type: "fill",
          source: `regiones_${zona}`,
          "source-layer": `regiones_${zona}_tile`,
          paint: {
            "fill-color": matchExpression,
            "fill-opacity": 0.5,
            "fill-outline-color": "#333333",
          },
        });
      }
    });

    if (!map.getSource("LocalidadesSedeINPI")) {
      map.addSource("LocalidadesSedeINPI", {
        type: "vector",
        url: "pmtiles://data/inpi.pmtiles",
      });
    }
    const dark2 = [
      "#1b9e77",
      "#d95f02",
      "#7570b3",
      "#e7298a",
      "#66a61e",
      "#e6ab02",
      "#a6761d",
      "#666666",
    ];
    const pueblosMatch: (string | number)[] = [];
    for (let i = 1; i <= 72; i++) {
      pueblosMatch.push(i.toString(), dark2[i % dark2.length]);
    }
    const puebloExpression = [
      "match",
      ["get", "ID_Pueblo"],
      ...pueblosMatch,
      "#666666",
    ] as any;
    if (!map.getLayer("LocalidadesSedeINPI")) {
      map.addLayer({
        id: "LocalidadesSedeINPI",
        type: "circle",
        source: "LocalidadesSedeINPI",
        "source-layer": "inpi_tile",
        paint: {
          "circle-radius": radioPorZoom(3, 4.5, 7, 9),
          "circle-color": puebloExpression,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": radioPorZoom(0.5, 0.8, 1.2, 1.6),
        },
      });
    }

    if (!map.getSource("PresidenciasMunicipales")) {
      map.addSource("PresidenciasMunicipales", {
        type: "vector",
        url: "pmtiles://data/PresidenciasMunicipales.pmtiles",
      });
    }
    if (!map.getLayer("PresidenciasMunicipales")) {
      map.addLayer({
        id: "PresidenciasMunicipales",
        type: "circle",
        source: "PresidenciasMunicipales",
        "source-layer": "PresidenciasMunicipales_tile",
        paint: {
          "circle-radius": radioPorZoom(2.5, 4, 6, 8),
          "circle-color": "#000000",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": radioPorZoom(0.7, 1, 1.4, 1.8),
        },
      });
    }

    // === Sedes de Asambleas y Mesas de Trabajo (LGPI) ===
    if (!map.getSource(SEDES_SOURCE)) {
      const sedesData = sedesFeatureCollection();
      sedesDataRef.current.set(map, sedesData);
      map.addSource(SEDES_SOURCE, {
        type: "geojson",
        data: sedesData,
      });
    }
    ensureSedeIconLoader(map, sedeIconLoaderRef.current);
    // Pin: icono rasterizado (gota con degradado, brillo y glifo) por tipo
    if (!map.getLayer("sedes_lgpi")) {
      map.addLayer({
        id: "sedes_lgpi",
        type: "symbol",
        source: SEDES_SOURCE,
        layout: {
          "icon-image": SEDE_ICON_MATCH,
          // El factor de hover (feature-state) resalta el pin bajo el cursor
          "icon-size": SEDE_ICON_SIZE_EXPR,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });
    }
    // Al recrearse el estilo (satelital / 3D) las capas nacen sin filtro
    applySedesFilter(map);
  };

  const updateLayerVisibility = useCallback(
    (map: maplibregl.Map) => {
      Object.entries(layersVisibility).forEach(([id, visible]) => {
        const vis = visible ? "visible" : "none";
        try {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", vis);
          }
        } catch {}
        // El toggle de sedes gobierna el punto y su halo pulsante
        if (id === SEDES_TOGGLE_ID) {
          SEDES_LAYERS.forEach((sid) => {
            if (map.getLayer(sid)) {
              map.setLayoutProperty(sid, "visibility", vis);
            }
          });
          if (!visible) {
            cierreSilenciosoRef.current = true;
            sedeDetailRef.current.get(map)?.remove();
            cierreSilenciosoRef.current = false;
          }
        }
      });
    },
    [layersVisibility],
  );

  const applyOrRemove3DEffects = (
    map: any,
    is3DActive: boolean,
    isSatelliteActive: boolean,
  ) => {
    if (is3DActive) {
      try {
        if (!map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256,
          });
        }

        const exaggeration = isSatelliteActive ? 1.2 : 1.5;
        const targetPitch = isSatelliteActive ? 60 : 70;
        const sunIntensity = isSatelliteActive ? 3 : 5;

        map.setTerrain({ source: "terrain-rgb", exaggeration });
        if (!map.getLayer("sky")) {
          map.addLayer({
            id: "sky",
            type: "sky",
            paint: {
              "sky-type": "atmosphere",
              "sky-atmosphere-sun": [0.0, 0.0],
              "sky-atmosphere-sun-intensity": sunIntensity,
            },
          } as any);
        }

        const currentPitch = map.getPitch();
        if (currentPitch < 5) {
          map.easeTo({
            pitch: targetPitch,
            bearing: map.getBearing(),
            duration: 1500,
            easing: (t: number) => t * (2 - t),
          });
        }
      } catch (error) {
        console.warn("Error aplicando efectos 3D:", error);
      }
    } else {
      try {
        const currentPitch = map.getPitch();
        if (currentPitch > 0) {
          map
            .easeTo({
              pitch: 0,
              duration: 1200,
              easing: (t: number) => t * (2 - t),
            })
            .once("moveend", () => {
              if (map.getLayer("sky")) map.removeLayer("sky");
              if (map.getTerrain()) map.setTerrain(null);
            });
        } else {
          if (map.getLayer("sky")) map.removeLayer("sky");
          if (map.getTerrain()) map.setTerrain(null);
        }
      } catch (error) {
        console.warn("Error quitando efectos 3D:", error);
      }
    }
  };

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const currentIsSatellite = isSatellite;
    const newIs3D = !is3D;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setIs3D(newIs3D);

    let newStyleUrl: string;
    if (currentIsSatellite) {
      newStyleUrl = satelliteStyleUrl;
    } else {
      newStyleUrl = newIs3D ? base3DStyleUrl : baseStyleUrl;
    }

    const needsStyleChange = !currentIsSatellite; // si no es satelital, cambiamos entre 2D/3D

    if (needsStyleChange) {
      map.setStyle(newStyleUrl, { diff: false });

      map.once("styledata", () => {
        addVectorLayers(map);

        if (newIs3D && !map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256,
          });
        }

        updateLayerVisibility(map);
        routesData.forEach((route) => drawSingleRouteOnMap(map, route));
        linesData.forEach((line) => drawSingleLineOnMap(map, line));
        attachAllTooltipEvents(map);

        if (blinkAnimationId.current)
          cancelAnimationFrame(blinkAnimationId.current);
        const animateComindPulse = (timestamp: number) => {
          const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
          const baseRadius = 8,
            maxRadius = 12;
          const currentRadius =
            baseRadius + (maxRadius - baseRadius) * pulseProgress;
          const baseHaloRadius = 12,
            maxHaloRadius = 18;
          const currentHaloRadius =
            baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;
          const haloOpacity = 0.1 + 0.15 * pulseProgress;
          const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
          const pulseOpacity = 1 - pulseRadius / 25;

          if (map.getLayer("comind"))
            map.setPaintProperty("comind", "circle-radius", currentRadius);
          if (map.getLayer("comind-halo")) {
            map.setPaintProperty(
              "comind-halo",
              "circle-radius",
              currentHaloRadius,
            );
            map.setPaintProperty("comind-halo", "circle-opacity", haloOpacity);
          }
          if (map.getLayer("comind-pulse")) {
            map.setPaintProperty("comind-pulse", "circle-radius", pulseRadius);
            map.setPaintProperty(
              "comind-pulse",
              "circle-opacity",
              pulseOpacity * 0.4,
            );
          }
          blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
        };
        animateComindPulse(0);

        map.jumpTo({
          center: currentCenter,
          zoom: currentZoom,
          bearing: currentBearing,
          pitch: 0,
        });

        setTimeout(() => {
          applyOrRemove3DEffects(map, newIs3D, currentIsSatellite);
        }, 200);
      });
    } else {
      setTimeout(() => {
        applyOrRemove3DEffects(map, newIs3D, currentIsSatellite);
      }, 100);
    }
  };

  const toggleMeasurement = () => {
    const wasMeasuring = isMeasuring;
    setIsMeasuring(!wasMeasuring);
    setIsMeasuringLine(false);
    if (wasMeasuring) clearAllRoutes();
    setCurrentPoints([]);
    setCurrentLinePoints([]);
  };

  const toggleLineMeasurement = () => {
    const wasMeasuringLine = isMeasuringLine;
    setIsMeasuringLine(!wasMeasuringLine);
    setIsMeasuring(false);
    if (wasMeasuringLine) clearAllRoutes();
    setCurrentPoints([]);
    setCurrentLinePoints([]);
  };

  const resetNorth = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      bearing: 0,
      pitch: is3D ? map.getPitch() : 0,
      duration: 1000,
      easing: (t: number) => t * (2 - t),
    });
  };

  const splitResetNorth = () => {
    const map = splitMapRef.current;
    if (!map) return;
    map.easeTo({
      bearing: 0,
      pitch: splitIs3D ? map.getPitch() : 0,
      duration: 1000,
      easing: (t: number) => t * (2 - t),
    });
  };

  // === Split View Functions ===
  const initializeSplitMap = useCallback(() => {
    if (!splitContainerRef.current || splitMapRef.current) return;

    const mainMap = mapRef.current;
    if (!mainMap) return;

    // Copiar el estado actual del mapa principal
    const currentCenter = mainMap.getCenter();
    const currentZoom = mainMap.getZoom();
    const currentBearing = mainMap.getBearing();
    const currentPitch = mainMap.getPitch();

    // Determinar el estilo basado en el estado actual del mapa principal
    let styleUrl = baseStyleUrl;
    if (isSatellite) {
      styleUrl = satelliteStyleUrl;
    } else if (is3D) {
      styleUrl = base3DStyleUrl;
    }

    const splitMap = new maplibregl.Map({
      container: splitContainerRef.current,
      style: styleUrl,
      center: currentCenter,
      zoom: currentZoom,
      pitch: currentPitch,
      bearing: currentBearing,
      attributionControl: false,
      // Mismo límite de desplazamiento que el mapa principal
      maxBounds: MEXICO_BOUNDS,
      maxPitch: 85,
    });
    splitMapRef.current = splitMap;

    // Inicializar estados del split map igual al principal
    setSplitIsSatellite(isSatellite);
    setSplitIs3D(is3D);
    setSplitLayersVisibility({ ...layersVisibility });

    splitMap.on("load", () => {
      splitMap.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "Secretaría de Gobernación",
          compact: true,
        }),
        "bottom-right",
      );

      addVectorLayers(splitMap);

      // Aplicar la misma visibilidad de capas que el mapa principal
      const allToggleableLayers = [
        "ofrep_zona1",
        "ofrep_zona2",
        "regiones_zona1",
        "regiones_zona2",
        "LocalidadesSedeINPI",
        "PresidenciasMunicipales",
      ];
      allToggleableLayers.forEach((layerId) => {
        if (splitMap.getLayer(layerId)) {
          const vis = layersVisibility[layerId] ? "visible" : "none";
          splitMap.setLayoutProperty(layerId, "visibility", vis);
        }
      });

      // Las sedes heredan el estado del mapa principal
      const sedesVis =
        layersVisibility[SEDES_TOGGLE_ID] === false ? "none" : "visible";
      SEDES_LAYERS.forEach((layerId) => {
        if (splitMap.getLayer(layerId)) {
          splitMap.setLayoutProperty(layerId, "visibility", sedesVis);
        }
      });

      // Animación de pulso para centroides
      const animateSplitPulse = (timestamp: number) => {
        const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
        const baseRadius = 8,
          maxRadius = 12;
        const currentRadius =
          baseRadius + (maxRadius - baseRadius) * pulseProgress;
        const baseHaloRadius = 12,
          maxHaloRadius = 18;
        const currentHaloRadius =
          baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;
        const haloOpacity = 0.1 + 0.15 * pulseProgress;
        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - pulseRadius / 25;

        if (splitMap.getLayer("comind"))
          splitMap.setPaintProperty("comind", "circle-radius", currentRadius);
        if (splitMap.getLayer("comind-halo")) {
          splitMap.setPaintProperty(
            "comind-halo",
            "circle-radius",
            currentHaloRadius,
          );
          splitMap.setPaintProperty(
            "comind-halo",
            "circle-opacity",
            haloOpacity,
          );
        }
        if (splitMap.getLayer("comind-pulse")) {
          splitMap.setPaintProperty(
            "comind-pulse",
            "circle-radius",
            pulseRadius,
          );
          splitMap.setPaintProperty(
            "comind-pulse",
            "circle-opacity",
            pulseOpacity * 0.4,
          );
        }

        splitBlinkAnimationId.current =
          requestAnimationFrame(animateSplitPulse);
      };
      animateSplitPulse(0);

      // Inicializar minimapa del split
      if (splitMinimapContainerRef.current) {
        const splitMinimap = new maplibregl.Map({
          container: splitMinimapContainerRef.current,
          style: minimapStyleUrl,
          center: MINIMAP_FIXED_CENTER,
          zoom: MINIMAP_FIXED_ZOOM,
          interactive: false,
          attributionControl: false,
        });
        splitMinimapRef.current = splitMinimap;

        splitMinimap.on("load", () => {
          addMinimapIndicatorLayers(splitMinimap);
          syncMinimapIndicator(splitMinimap, splitMap);
        });

        const syncSplitMinimap = () =>
          syncMinimapIndicator(splitMinimapRef.current, splitMap);

        splitMap.on("move", syncSplitMinimap);
        splitMap.on("zoom", syncSplitMinimap);
        syncSplitMinimap();
      }

      // Reproyecta las etiquetas de distancia mientras el mapa se mueve
      const refrescarEtiquetas = () => setMapView((v) => v + 1);
      splitMap.on("move", refrescarEtiquetas);
      splitMap.on("zoom", refrescarEtiquetas);

      attachAllTooltipEvents(splitMap);

      // Animación de brújula para split map
      const animateSplitCompass = () => {
        const map = splitMapRef.current;
        if (!map) {
          splitCompassAnimId.current =
            requestAnimationFrame(animateSplitCompass);
          return;
        }
        const target = map.getBearing();
        const current = splitDisplayBearingRef.current;
        const diff = ((target - current + 540) % 360) - 180;
        const next = current + diff * 0.15;
        splitDisplayBearingRef.current = next;
        setSplitDisplayBearing(next);
        splitCompassAnimId.current = requestAnimationFrame(animateSplitCompass);
      };
      splitCompassAnimId.current = requestAnimationFrame(animateSplitCompass);

      // Aplicar 3D si estaba activo
      if (is3D) {
        if (!splitMap.getSource("terrain-rgb")) {
          splitMap.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256,
          });
        }
        splitMap.setTerrain({
          source: "terrain-rgb",
          exaggeration: isSatellite ? 1.2 : 1.5,
        });
        if (!splitMap.getLayer("sky")) {
          splitMap.addLayer({
            id: "sky",
            type: "sky",
            paint: {
              "sky-type": "atmosphere",
              "sky-atmosphere-sun": [0.0, 0.0],
              "sky-atmosphere-sun-intensity": isSatellite ? 3 : 5,
            },
          } as any);
        }
      }
    });
  }, [
    isSatellite,
    is3D,
    layersVisibility,
    apiKey,
    attachAllTooltipEvents,
    base3DStyleUrl,
    minimapStyleUrl,
    satelliteStyleUrl,
  ]);

  const destroySplitMap = useCallback(() => {
    if (splitBlinkAnimationId.current) {
      cancelAnimationFrame(splitBlinkAnimationId.current);
      splitBlinkAnimationId.current = null;
    }
    if (splitCompassAnimId.current) {
      cancelAnimationFrame(splitCompassAnimId.current);
      splitCompassAnimId.current = null;
    }
    if (splitMinimapRef.current) {
      splitMinimapRef.current.remove();
      splitMinimapRef.current = null;
    }
    if (splitMapRef.current) {
      splitMapRef.current.remove();
      splitMapRef.current = null;
    }
    // Al reabrir, el mapa dividido vuelve a heredar la vista del principal en
    // lugar de encuadrar sus filtros de inmediato.
    primerEncuadreSplitRef.current = true;

    // Las mediciones vivían en las capas de ese mapa: se van con él
    setSplitRoutesData([]);
    setSplitLinesData([]);
    setSplitCurrentPoints([]);
    setSplitCurrentLinePoints([]);
    setSplitIsMeasuring(false);
    setSplitIsMeasuringLine(false);
  }, []);

  const toggleSplitView = useCallback(() => {
    if (isSplitView) {
      destroySplitMap();
      setIsSplitView(false);
    } else {
      setIsSplitView(true);
      // La inicialización se hace en useEffect cuando el container está disponible
    }
  }, [isSplitView, destroySplitMap]);

  // Inicializar split map cuando se activa y el container está listo
  useEffect(() => {
    if (isSplitView && splitContainerRef.current && !splitMapRef.current) {
      // Pequeño delay para asegurar que el DOM esté actualizado
      const timer = setTimeout(() => {
        initializeSplitMap();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isSplitView, initializeSplitMap]);

  // Manejar el arrastre del divisor
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
  }, []);

  useEffect(() => {
    if (!isDraggingDivider) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerWidth = window.innerWidth;
      const newWidth = (e.clientX / containerWidth) * 100;
      setSplitWidth(Math.min(Math.max(newWidth, 20), 80)); // Limitar entre 20% y 80%
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
      // Redimensionar los mapas
      setTimeout(() => {
        mapRef.current?.resize();
        splitMapRef.current?.resize();
      }, 50);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingDivider]);

  const toggleSatellite = () => {
    const map = mapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const was3D = is3D;
    const newIsSatellite = !isSatellite;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setIsSatellite(newIsSatellite);

    let newStyleUrl: string;
    if (was3D) {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : base3DStyleUrl;
    } else {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : baseStyleUrl;
    }

    map.setStyle(newStyleUrl, { diff: false });

    map.once("styledata", () => {
      addVectorLayers(map);
      updateLayerVisibility(map);
      routesData.forEach((route) => drawSingleRouteOnMap(map, route));
      linesData.forEach((line) => drawSingleLineOnMap(map, line));
      attachAllTooltipEvents(map);

      if (blinkAnimationId.current)
        cancelAnimationFrame(blinkAnimationId.current);
      const animateComindPulse = (timestamp: number) => {
        const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
        const baseRadius = 8,
          maxRadius = 12;
        const currentRadius =
          baseRadius + (maxRadius - baseRadius) * pulseProgress;
        const baseHaloRadius = 12,
          maxHaloRadius = 18;
        const currentHaloRadius =
          baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;
        const haloOpacity = 0.1 + 0.15 * pulseProgress;
        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - pulseRadius / 25;

        if (map.getLayer("comind"))
          map.setPaintProperty("comind", "circle-radius", currentRadius);
        if (map.getLayer("comind-halo")) {
          map.setPaintProperty(
            "comind-halo",
            "circle-radius",
            currentHaloRadius,
          );
          map.setPaintProperty("comind-halo", "circle-opacity", haloOpacity);
        }
        if (map.getLayer("comind-pulse")) {
          map.setPaintProperty("comind-pulse", "circle-radius", pulseRadius);
          map.setPaintProperty(
            "comind-pulse",
            "circle-opacity",
            pulseOpacity * 0.4,
          );
        }

        blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
      };
      animateComindPulse(0);

      map.jumpTo({
        center: currentCenter,
        zoom: currentZoom,
        bearing: currentBearing,
        pitch: 0,
      });

      if (was3D) {
        if (!map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256,
          });
        }

        const exaggeration = newIsSatellite ? 1.2 : 1.5;
        const sunIntensity = newIsSatellite ? 3 : 5;
        const targetPitch = newIsSatellite ? 60 : 70;

        map.setTerrain({ source: "terrain-rgb", exaggeration });
        if (!map.getLayer("sky")) {
          map.addLayer({
            id: "sky",
            type: "sky",
            paint: {
              "sky-type": "atmosphere",
              "sky-atmosphere-sun": [0, 0],
              "sky-atmosphere-sun-intensity": sunIntensity,
            },
          } as any);
        }

        setTimeout(() => {
          if (map.getPitch() < 5) {
            map.easeTo({
              pitch: targetPitch,
              bearing: currentBearing,
              duration: 1500,
              easing: (t: number) => t * (2 - t),
            });
          }
        }, 200);
      }
    });
  };

  const animateCompass = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      compassAnimId.current = requestAnimationFrame(animateCompass);
      return;
    }
    const target = map.getBearing();
    const current = displayBearingRef.current;
    const diff = ((target - current + 540) % 360) - 180;
    const next = current + diff * 0.15;
    displayBearingRef.current = next;
    setDisplayBearing(next);
    compassAnimId.current = requestAnimationFrame(animateCompass);
  }, []);

  // === Split Map Toggle Functions ===
  const toggleSplitSatellite = () => {
    const map = splitMapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const was3D = splitIs3D;
    const newIsSatellite = !splitIsSatellite;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setSplitIsSatellite(newIsSatellite);

    let newStyleUrl: string;
    if (was3D) {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : base3DStyleUrl;
    } else {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : baseStyleUrl;
    }

    map.setStyle(newStyleUrl, { diff: false });

    map.once("styledata", () => {
      addVectorLayers(map);

      // Aplicar visibilidad de capas del split map
      Object.entries(splitLayersVisibility).forEach(([id, visible]) => {
        const vis = visible ? "visible" : "none";
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });

      attachAllTooltipEvents(map);

      map.jumpTo({
        center: currentCenter,
        zoom: currentZoom,
        bearing: currentBearing,
        pitch: 0,
      });

      if (was3D) {
        if (!map.getSource("terrain-rgb")) {
          map.addSource("terrain-rgb", {
            type: "raster-dem",
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256,
          });
        }
        const exaggeration = newIsSatellite ? 1.2 : 1.5;
        const sunIntensity = newIsSatellite ? 3 : 5;
        const targetPitch = newIsSatellite ? 60 : 70;

        map.setTerrain({ source: "terrain-rgb", exaggeration });
        if (!map.getLayer("sky")) {
          map.addLayer({
            id: "sky",
            type: "sky",
            paint: {
              "sky-type": "atmosphere",
              "sky-atmosphere-sun": [0, 0],
              "sky-atmosphere-sun-intensity": sunIntensity,
            },
          } as any);
        }

        // Aplicar la animación de inclinación 3D
        setTimeout(() => {
          if (map.getPitch() < 5) {
            map.easeTo({
              pitch: targetPitch,
              bearing: currentBearing,
              duration: 1500,
              easing: (t: number) => t * (2 - t),
            });
          }
        }, 200);
      }
    });
  };

  const toggleSplit3D = () => {
    const map = splitMapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const currentIsSatellite = splitIsSatellite;
    const newIs3D = !splitIs3D;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer("sky")) map.removeLayer("sky");

    setSplitIs3D(newIs3D);

    let newStyleUrl: string;
    if (currentIsSatellite) {
      newStyleUrl = satelliteStyleUrl;
    } else {
      newStyleUrl = newIs3D ? base3DStyleUrl : baseStyleUrl;
    }

    const needsStyleChange = !currentIsSatellite;

    if (needsStyleChange) {
      map.setStyle(newStyleUrl, { diff: false });

      map.once("styledata", () => {
        addVectorLayers(map);

        Object.entries(splitLayersVisibility).forEach(([id, visible]) => {
          const vis = visible ? "visible" : "none";
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
        });

        attachAllTooltipEvents(map);

        map.jumpTo({
          center: currentCenter,
          zoom: currentZoom,
          bearing: currentBearing,
          pitch: 0,
        });

        setTimeout(() => {
          applyOrRemove3DEffects(map, newIs3D, currentIsSatellite);
        }, 200);
      });
    } else {
      setTimeout(() => {
        applyOrRemove3DEffects(map, newIs3D, currentIsSatellite);
      }, 100);
    }
  };

  const toggleSplitMeasurement = () => {
    const estaba = splitIsMeasuring;
    setSplitIsMeasuring(!estaba);
    setSplitIsMeasuringLine(false);
    // Apagar la herramienta limpia lo trazado, igual que en el principal
    if (estaba) clearAllRoutesSplit();
    setSplitCurrentPoints([]);
    setSplitCurrentLinePoints([]);
  };

  const toggleSplitLineMeasurement = () => {
    const estaba = splitIsMeasuringLine;
    setSplitIsMeasuringLine(!estaba);
    setSplitIsMeasuring(false);
    if (estaba) clearAllRoutesSplit();
    setSplitCurrentPoints([]);
    setSplitCurrentLinePoints([]);
  };

  // Handler para cambiar visibilidad de capas en el mapa secundario
  const handleSplitLayerToggle = useCallback((id: string) => {
    setSplitLayersVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Configuración de secciones para el InfoBox del mapa secundario
  // Mismas secciones que el panel del mapa principal, con estado propio
  const splitInfoBoxSections: InfoBoxSection[] = [
    {
      title: "Sedes LGPI",
      items: [
        {
          // Capa base del visor: sin interruptor, siempre visible
          id: SEDES_TOGGLE_ID,
          label: "Asambleas regionales",
          color: SEDE_COLORS[TIPO_ASAMBLEA],
          shape: "circle",
          checked: true,
        },
        {
          // Sólo leyenda: comparte la capa con la fila anterior
          id: "sedesLGPI-mesa",
          label: "Mesas de trabajo",
          color: SEDE_COLORS[TIPO_MESA],
          shape: "circle",
          checked: true,
        },
      ],
    },
    {
      // El salto de línea lo respeta .legend-title con white-space: pre-line
      title: "Comunidades Indígenas y\nAfromexicanas",
      items: [
        {
          id: "LocalidadesSedeINPI",
          label: "Pueblos Indígenas",
          color: "#666666",
          shape: "circle",
          switch: true,
          checked: splitLayersVisibility["LocalidadesSedeINPI"] ?? false,
        },
      ],
    },
    {
      title: "Zona 1 - NORTE",
      items: [
        {
          id: "ofrep_zona1",
          label: "Oficinas de Representación INPI",
          color: "#a57f2c",
          shape: "circle",
          switch: true,
          checked: splitLayersVisibility["ofrep_zona1"] ?? false,
        },
        {
          id: "regiones_zona1",
          label: "Regiones de Paz",
          color: "#66c2a5",
          shape: "square",
          switch: true,
          checked: splitLayersVisibility["regiones_zona1"] ?? false,
        },
      ],
    },
    {
      title: "Zona 2 - SUR",
      items: [
        {
          id: "ofrep_zona2",
          label: "Oficinas de Representación INPI",
          color: "#a57f2c",
          shape: "circle",
          switch: true,
          checked: splitLayersVisibility["ofrep_zona2"] ?? false,
        },
        {
          id: "regiones_zona2",
          label: "Regiones de Paz",
          color: "#fc8d62",
          shape: "square",
          switch: true,
          checked: splitLayersVisibility["regiones_zona2"] ?? false,
        },
      ],
    },
    {
      title: "Presidencias Municipales",
      items: [
        {
          id: "PresidenciasMunicipales",
          label: "Cabeceras Municipales",
          color: "#000000",
          shape: "circle",
          switch: true,
          checked: splitLayersVisibility["PresidenciasMunicipales"] ?? false,
        },
      ],
    },
  ];

  // Efecto para actualizar la visibilidad de capas en el mapa secundario
  useEffect(() => {
    const map = splitMapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    Object.entries(splitLayersVisibility).forEach(([id, visible]) => {
      const vis = visible ? "visible" : "none";
      try {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", vis);
        }
        if (id === SEDES_TOGGLE_ID) {
          SEDES_LAYERS.forEach((sid) => {
            if (map.getLayer(sid)) {
              map.setLayoutProperty(sid, "visibility", vis);
            }
          });
        }
      } catch (e) {
        // Layer might not exist yet
      }
    });
  }, [splitLayersVisibility]);

  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container,
      style: baseStyleUrl,
      // El encuadre manda sobre center/zoom: así la república llena el visor
      // en cualquier resolución, en lugar de quedar chica con un zoom fijo.
      bounds: MEXICO_VIEW,
      fitBoundsOptions: { padding: MEXICO_VIEW_PADDING },
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      // Mismo límite de desplazamiento que la vista dividida
      maxBounds: MEXICO_BOUNDS,
      maxPitch: 85,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "Secretaría de Gobernación",
          compact: true,
        }),
        "bottom-right",
      );

      if (map.getPitch() > 0) map.setPitch(0);

      addVectorLayers(map);

      const allToggleableLayers = [
        "ofrep_zona1",
        "ofrep_zona2",
        "regiones_zona1",
        "regiones_zona2",
        "LocalidadesSedeINPI",
        "PresidenciasMunicipales",
      ];
      allToggleableLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "none");
        }
      });

      const updatePopupPositions = () => setMapView((v) => v + 1);
      map.on("move", updatePopupPositions);
      map.on("zoom", updatePopupPositions);

      const animatePulse = (timestamp: number) => {
        const radius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const opacity = 1 - radius / 25;

        ["start-point-current-pulse", "end-point-current-pulse"].forEach(
          (layerId) => {
            if (map.getLayer(layerId)) {
              map.setPaintProperty(layerId, "circle-radius", radius);
              map.setPaintProperty(layerId, "circle-opacity", opacity);
            }
          },
        );

        [
          "start-point-line-current-pulse",
          "end-point-line-current-pulse",
        ].forEach((layerId) => {
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, "circle-radius", radius);
            map.setPaintProperty(layerId, "circle-opacity", opacity);
          }
        });

        animationFrameId.current = requestAnimationFrame(animatePulse);
      };
      animatePulse(0);

      const animateComindPulse = (timestamp: number) => {
        const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
        const baseRadius = 8;
        const maxRadius = 12;
        const currentRadius =
          baseRadius + (maxRadius - baseRadius) * pulseProgress;

        const baseHaloRadius = 12;
        const maxHaloRadius = 18;
        const currentHaloRadius =
          baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;

        const haloOpacity = 0.1 + 0.15 * pulseProgress;

        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - pulseRadius / 25;

        if (map.getLayer("comind")) {
          map.setPaintProperty("comind", "circle-radius", currentRadius);
        }
        if (map.getLayer("comind-halo")) {
          map.setPaintProperty(
            "comind-halo",
            "circle-radius",
            currentHaloRadius,
          );
          map.setPaintProperty("comind-halo", "circle-opacity", haloOpacity);
        }
        if (map.getLayer("comind-pulse")) {
          map.setPaintProperty("comind-pulse", "circle-radius", pulseRadius);
          map.setPaintProperty(
            "comind-pulse",
            "circle-opacity",
            pulseOpacity * 0.4,
          );
        }

        blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
      };
      animateComindPulse(0);

      // Panorama fijo: el minimapa no se mueve ni cambia de zoom, sólo indica
      // la posición del mapa principal.
      const minimap = new maplibregl.Map({
        container: minimapContainerRef.current as HTMLDivElement,
        style: minimapStyleUrl,
        center: MINIMAP_FIXED_CENTER,
        zoom: MINIMAP_FIXED_ZOOM,
        interactive: false,
        attributionControl: false,
      });
      minimapRef.current = minimap;

      minimap.on("load", () => {
        addMinimapIndicatorLayers(minimap);
        syncMinimapIndicator(minimap, map);
      });

      const syncMaps = () => syncMinimapIndicator(minimapRef.current, map);

      map.on("move", syncMaps);
      map.on("zoom", syncMaps);
      syncMaps();

      attachAllTooltipEvents(map);

      if (!compassAnimId.current) {
        compassAnimId.current = requestAnimationFrame(animateCompass);
      }
    });

    return () => {
      // Al desmontar, el cierre de la ficha no debe intentar mover el mapa
      cierreSilenciosoRef.current = true;
      if (animationFrameId.current)
        cancelAnimationFrame(animationFrameId.current);
      if (blinkAnimationId.current)
        cancelAnimationFrame(blinkAnimationId.current);
      if (compassAnimId.current) cancelAnimationFrame(compassAnimId.current);
      compassAnimId.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (minimapRef.current) {
        minimapRef.current.remove();
        minimapRef.current = null;
      }
      maplibregl.removeProtocol("pmtiles");
    };
  }, [
    apiKey,
    attachAllTooltipEvents,
    drawSingleRouteOnMap,
    animateCompass,
    minimapStyleUrl,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateLayerVisibility(map);
    } else {
      map.once("styledata", () => updateLayerVisibility(map));
    }
  }, [layersVisibility, updateLayerVisibility]);

  // === Sedes LGPI: zoom automático al conjunto filtrado ===
  // Recibe el mapa: el principal y el dividido encuadran sus propios filtros.
  const encuadrarSedesEn = useCallback(
    (map: MaplibreMap | null, sedes: SedeLGPI[]) => {
      if (!map || !sedes.length) return;

      if (sedes.length === 1) {
        map.flyTo({
          center: [sedes[0].lon, sedes[0].lat],
          zoom: 12,
          duration: 2200,
          curve: 1.15,
          easing: easeInOutCubic,
          essential: true,
        });
        return;
      }

      // Deja aire para el panel de capas (izquierda) y el de filtros (derecha)
      const ancho = map.getContainer().clientWidth || 1000;
      const bounds = new maplibregl.LngLatBounds();
      sedes.forEach((s) => bounds.extend([s.lon, s.lat] as [number, number]));

      map.fitBounds(bounds, {
        padding: {
          top: 90,
          bottom: 90,
          left: Math.min(340, ancho * 0.28),
          right: Math.min(310, ancho * 0.28),
        },
        maxZoom: 13,
        duration: 1600,
        easing: easeInOutCubic,
        essential: true,
      });
    },
    [],
  );

  encuadrarSedesRef.current = encuadrarSedesEn;

  const handleSedesFiltradas = useCallback((sedes: SedeLGPI[]) => {
    setSedesFiltradas(sedes);
  }, []);

  const verTodasLasSedes = useCallback(() => {
    encuadrarSedesEn(mapRef.current, SEDES_LGPI);
  }, [encuadrarSedesEn]);

  const handleSedesFiltradasSplit = useCallback((sedes: SedeLGPI[]) => {
    setSedesFiltradasSplit(sedes);
  }, []);

  const verTodasLasSedesSplit = useCallback(() => {
    encuadrarSedesEn(splitMapRef.current, SEDES_LGPI);
  }, [encuadrarSedesEn]);

  useEffect(() => {
    // Sin filtros activos se limpia la expresión, en vez de listar las 89
    sedesFilterRef.current =
      sedesFiltradas.length === SEDES_LGPI.length
        ? null
        : sedesFiltradas.map((s) => SEDES_LGPI.indexOf(s));

    sedesFiltradasRef.current = sedesFiltradas;

    const map = mapRef.current;
    if (map) applySedesFilter(map);
    // Cambiar de filtro ya reencuadra por su cuenta: este cierre no debe hacerlo
    cierreSilenciosoRef.current = true;
    if (map) sedeDetailRef.current.get(map)?.remove();
    cierreSilenciosoRef.current = false;

    // El primer render ya arranca con la vista de la república
    if (primerEncuadreRef.current) {
      primerEncuadreRef.current = false;
      return;
    }
    encuadrarSedesEn(map, sedesFiltradas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedesFiltradas, encuadrarSedesEn]);

  // Lo mismo para el mapa dividido, con sus propios filtros
  useEffect(() => {
    sedesFilterSplitRef.current =
      sedesFiltradasSplit.length === SEDES_LGPI.length
        ? null
        : sedesFiltradasSplit.map((s) => SEDES_LGPI.indexOf(s));

    sedesFiltradasSplitRef.current = sedesFiltradasSplit;

    const map = splitMapRef.current;
    if (!map) return;

    applySedesFilter(map);
    cierreSilenciosoRef.current = true;
    sedeDetailRef.current.get(map)?.remove();
    cierreSilenciosoRef.current = false;

    // Al abrirse, el mapa dividido ya nace encuadrado como el principal
    if (primerEncuadreSplitRef.current) {
      primerEncuadreSplitRef.current = false;
      return;
    }
    encuadrarSedesEn(map, sedesFiltradasSplit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedesFiltradasSplit, encuadrarSedesEn, isSplitView]);

  // Sobre la imagen satelital el fondo es oscuro y variado: los paneles de
  // vidrio pierden legibilidad, así que se avisa por el body para que suban su
  // opacidad. Basta con que uno de los dos mapas esté en satelital.
  useEffect(() => {
    const satelital = isSatellite || splitIsSatellite;
    document.body.classList.toggle("mapa-satelital", satelital);
    return () => document.body.classList.remove("mapa-satelital");
  }, [isSatellite, splitIsSatellite]);

  // Al completar el par de puntos se traza: cada mapa con su propio estado
  useEffect(() => {
    if (currentPoints.length === 2)
      addRouteToMap(mapRef.current, currentPoints, setRoutesData, setCurrentPoints);
  }, [currentPoints, addRouteToMap]);

  useEffect(() => {
    if (currentLinePoints.length === 2)
      addLineToMap(
        mapRef.current,
        currentLinePoints,
        setLinesData,
        setCurrentLinePoints,
      );
  }, [currentLinePoints, addLineToMap]);

  useEffect(() => {
    if (splitCurrentPoints.length === 2)
      addRouteToMap(
        splitMapRef.current,
        splitCurrentPoints,
        setSplitRoutesData,
        setSplitCurrentPoints,
      );
  }, [splitCurrentPoints, addRouteToMap]);

  useEffect(() => {
    if (splitCurrentLinePoints.length === 2)
      addLineToMap(
        splitMapRef.current,
        splitCurrentLinePoints,
        setSplitLinesData,
        setSplitCurrentLinePoints,
      );
  }, [splitCurrentLinePoints, addLineToMap]);

  // Punto provisional que marca cada clic mientras se mide
  const marcarPuntoProvisional = useCallback(
    (
      map: MaplibreMap,
      id: "start" | "end",
      lngLat: LngLat,
      isLine: boolean,
    ) => {
      const prefix = isLine ? "line-" : "";
      const sourceId = `${id}-point-${prefix}current`;
      const pointFeature: Feature<Point> = {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] },
        properties: {},
      };
      const color = isLine ? "#ff6b35" : "#009f81";

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as GeoJSONSource).setData(pointFeature);
        return;
      }
      map.addSource(sourceId, { type: "geojson", data: pointFeature });
      map.addLayer({
        id: `${sourceId}-pulse`,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 10,
          "circle-color": color,
          "circle-opacity": 0.8,
        },
      });
      map.addLayer({
        id: sourceId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 6,
          "circle-color": color,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    },
    [],
  );

  // Registra el clic que va acumulando los puntos. Devuelve la limpieza, para
  // que ambos mapas puedan usarla desde su propio useEffect.
  const registrarMedicion = useCallback(
    (
      map: MaplibreMap | null,
      midiendoRuta: boolean,
      midiendoLinea: boolean,
      puntosRuta: LngLatLike[],
      puntosLinea: LngLatLike[],
      setPuntosRuta: React.Dispatch<React.SetStateAction<LngLatLike[]>>,
      setPuntosLinea: React.Dispatch<React.SetStateAction<LngLatLike[]>>,
    ) => {
      if (!map) return;

      const alHacerClic = (e: maplibregl.MapMouseEvent) => {
        if (midiendoRuta) {
          if (puntosRuta.length >= 2) return;
          marcarPuntoProvisional(
            map,
            puntosRuta.length === 0 ? "start" : "end",
            e.lngLat,
            false,
          );
          setPuntosRuta((prev) => [...prev, e.lngLat]);
        } else if (midiendoLinea) {
          if (puntosLinea.length >= 2) return;
          marcarPuntoProvisional(
            map,
            puntosLinea.length === 0 ? "start" : "end",
            e.lngLat,
            true,
          );
          setPuntosLinea((prev) => [...prev, e.lngLat]);
        }
      };

      if (midiendoRuta || midiendoLinea) {
        map.getCanvas().style.cursor = "crosshair";
        map.on("click", alHacerClic);
      }

      return () => {
        if (map.getCanvas()) map.getCanvas().style.cursor = "";
        map.off("click", alHacerClic);
      };
    },
    [marcarPuntoProvisional],
  );

  useEffect(
    () =>
      registrarMedicion(
        mapRef.current,
        isMeasuring,
        isMeasuringLine,
        currentPoints,
        currentLinePoints,
        setCurrentPoints,
        setCurrentLinePoints,
      ),
    [
      isMeasuring,
      isMeasuringLine,
      currentPoints,
      currentLinePoints,
      registrarMedicion,
    ],
  );

  useEffect(
    () =>
      registrarMedicion(
        splitMapRef.current,
        splitIsMeasuring,
        splitIsMeasuringLine,
        splitCurrentPoints,
        splitCurrentLinePoints,
        setSplitCurrentPoints,
        setSplitCurrentLinePoints,
      ),
    [
      splitIsMeasuring,
      splitIsMeasuringLine,
      splitCurrentPoints,
      splitCurrentLinePoints,
      registrarMedicion,
      isSplitView,
    ],
  );


  // Icono para el botón de split view
  const getSplitIcon = (isOn: boolean) => {
    const color = isOn ? "#007cbf" : "#6c757d";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        display: "flex",
      }}
    >
      {/* Mapa principal */}
      <div
        style={{
          position: "relative",
          width: isSplitView ? `${splitWidth}%` : "100%",
          height: "100%",
          transition: isDraggingDivider ? "none" : "width 0.3s ease",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Logo institucional, pegado a la esquina superior derecha */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 25,
            background: "rgba(255, 255, 255, 0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            // Sólo se redondea la esquina interior
            borderRadius: "0 0 0 14px",
            // Sin ancho ni alto fijos: la caja se ajusta al logo (612 × 74 px)
            padding: "10px 18px",
            boxShadow: "0 8px 20px rgba(97, 18, 50, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={`${process.env.PUBLIC_URL}/logo_SEGOB.png`}
            alt="SEGOB"
            style={{
              display: "block",
              height: 50,
              width: "auto",
              // En ventanas angostas se encoge sin deformarse
              maxWidth: "45vw",
              objectFit: "contain",
            }}
          />
        </div>


        <div className="custom-popup-container">
          {routesData.map((route, idx) => {
            if (!mapRef.current) return null;
            const sp = mapRef.current.project(route.endPoint);
            return (
              <div
                key={route.id}
                className="custom-route-popup"
                style={{
                  left: `${sp.x + 14}px`,
                  top: `${sp.y - 8}px`,
                }}
              >
                <strong>Distancia:</strong> {route.distance} km
                <br />
                <strong>Tiempo:</strong> {route.duration}
              </div>
            );
          })}
          {linesData.map((line, idx) => {
            if (!mapRef.current) return null;
            const sp = mapRef.current.project(line.endPoint);
            return (
              <div
                key={`line-${line.id}`}
                className="custom-route-popup"
                style={{
                  left: `${sp.x + 14}px`,
                  top: `${sp.y - 8}px`,
                  backgroundColor: "#ff6b35",
                  color: "#ffffff",
                }}
              >
                <strong>Distancia:</strong> {line.distance} km
                <br />
                <strong>Tipo:</strong> {line.duration}
              </div>
            );
          })}
        </div>

        {/* Dock derecho: herramientas arriba, filtros de sedes debajo.
            El modificador lo baja para no quedar bajo el logo. */}
        <div className="map-right-dock map-right-dock--bajo-logo">
          {/* Controles del mapa principal */}
          <div className="map-control-stack">
          <button
            className={`map-control-button ${isSatellite ? "active" : ""}`}
            onClick={toggleSatellite}
            title={isSatellite ? "Volver a mapa normal" : "Ver mapa satelital"}
            aria-label="Cambiar vista"
            aria-pressed={isSatellite}
            data-label={isSatellite ? "Mapa normal" : "Vista satelital"}
          >
            <img
              src={`${process.env.PUBLIC_URL}/satelitebw.png`}
              alt="Cambiar vista"
              className="button-icon"
            />
          </button>

          <button
            className={`map-control-button ${isMeasuring ? "active" : ""}`}
            onClick={toggleMeasurement}
            title={isMeasuring ? "Terminar medición de ruta" : "Medir ruta"}
            aria-label="Medir ruta"
            aria-pressed={isMeasuring}
            data-label={isMeasuring ? "Terminar ruta" : "Trazar ruta"}
          >
            <img
              src={`${process.env.PUBLIC_URL}/rutabw.png`}
              alt="Medir ruta"
              className="button-icon"
            />
          </button>

          <button
            className={`map-control-button ${isMeasuringLine ? "active" : ""}`}
            onClick={toggleLineMeasurement}
            title={
              isMeasuringLine
                ? "Terminar medición línea recta"
                : "Medir línea recta"
            }
            aria-label="Medir línea recta"
            aria-pressed={isMeasuringLine}
            data-label={isMeasuringLine ? "Terminar línea" : "Trazar línea"}
          >
            <div className="button-icon button-icon--glyph">⟷</div>
          </button>

          <button
            className={`map-control-button ${is3D ? "active" : ""}`}
            onClick={toggle3D}
            title={is3D ? "Desactivar vista 3D" : "Activar vista 3D"}
            aria-label="Vista 3D"
            aria-pressed={is3D}
            data-label={is3D ? "Desactivar 3D" : "Vista 3D"}
          >
            <img src={get3DIcon(is3D)} alt="Vista 3D" className="button-icon" />
          </button>

          {/* Brújula */}
          <button
            className="map-control-button compass-btn"
            onClick={resetNorth}
            title="Restaurar norte"
            aria-label="Brújula: restablecer norte"
            data-label="Restaurar norte"
          >
            <svg viewBox="0 0 100 100" className="compass-svg">
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="#ffffff"
                stroke="#e5e7eb"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="#f9fafb"
                stroke="#d1d5db"
                strokeWidth="1"
              />
              <text
                x="50"
                y="18"
                textAnchor="middle"
                fontSize="12"
                fontFamily="Inter, system-ui"
                fill="#6b7280"
              >
                N
              </text>
              <g
                style={{
                  transformOrigin: "50px 50px",
                  transform: `rotate(${-displayBearing}deg)`,
                }}
              >
                <polygon points="50,12 44,50 56,50" fill="#ef4444" />
                <polygon points="50,88 44,50 56,50" fill="#374151" />
                <circle cx="50" cy="50" r="4" fill="#111827" />
              </g>
            </svg>
          </button>

          {/* Botón para dividir pantalla */}
          <button
            className={`map-control-button ${isSplitView ? "active" : ""}`}
            onClick={toggleSplitView}
            title={isSplitView ? "Cerrar vista dividida" : "Dividir pantalla"}
            aria-label="Dividir pantalla"
            aria-pressed={isSplitView}
            data-label={isSplitView ? "Cerrar división" : "Dividir pantalla"}
          >
            <img
              src={getSplitIcon(isSplitView)}
              alt="Dividir pantalla"
              className="button-icon"
            />
          </button>
          </div>
        </div>

        {/* Debajo del InfoBox (izquierda): el offset lo publica App.tsx al
            medir el alto real del InfoBox */}
        <div className="sedes-panel-left-dock">
          <SedesPanel
            onFilteredChange={handleSedesFiltradas}
            onResetView={verTodasLasSedes}
            disabled={layersVisibility[SEDES_TOGGLE_ID] === false}
          />
        </div>

        <div ref={minimapContainerRef} className="minimap-container" />
      </div>

      {/* Divisor arrastrable */}
      {isSplitView && (
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            width: "8px",
            height: "100%",
            background:
              "linear-gradient(90deg, #e5e7eb 0%, #d1d5db 50%, #e5e7eb 100%)",
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            boxShadow: "0 0 8px rgba(0,0,0,0.2)",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "40px",
              background: "#9ca3af",
              borderRadius: "2px",
            }}
          />
        </div>
      )}

      {/* Mapa secundario (split view) */}
      {isSplitView && (
        <div
          style={{
            position: "relative",
            width: `${100 - splitWidth}%`,
            height: "100%",
            transition: isDraggingDivider ? "none" : "width 0.3s ease",
          }}
        >
          <div
            ref={splitContainerRef}
            style={{ width: "100%", height: "100%" }}
          />

          {/* Etiquetas de distancia del mapa secundario */}
          <div className="custom-popup-container">
            {splitRoutesData.map((route) => {
              if (!splitMapRef.current) return null;
              const sp = splitMapRef.current.project(route.endPoint);
              return (
                <div
                  key={route.id}
                  className="custom-route-popup"
                  style={{ left: `${sp.x + 14}px`, top: `${sp.y - 8}px` }}
                >
                  <strong>Distancia:</strong> {route.distance} km
                  <br />
                  <strong>Tiempo:</strong> {route.duration}
                </div>
              );
            })}
            {splitLinesData.map((line) => {
              if (!splitMapRef.current) return null;
              const sp = splitMapRef.current.project(line.endPoint);
              return (
                <div
                  key={`line-${line.id}`}
                  className="custom-route-popup"
                  style={{
                    left: `${sp.x + 14}px`,
                    top: `${sp.y - 8}px`,
                    backgroundColor: "#ff6b35",
                    color: "#ffffff",
                  }}
                >
                  <strong>Distancia:</strong> {line.distance} km
                  <br />
                  <strong>Tipo:</strong> {line.duration}
                </div>
              );
            })}
          </div>

          {/* Dock derecho propio del mapa secundario */}
          <div className="map-right-dock">
            {/* Controles del mapa secundario (sin botón de split) */}
            <div className="map-control-stack">
            <button
              className={`map-control-button ${splitIsSatellite ? "active" : ""}`}
              onClick={toggleSplitSatellite}
              title={
                splitIsSatellite ? "Volver a mapa normal" : "Ver mapa satelital"
              }
              aria-label="Cambiar vista"
              aria-pressed={splitIsSatellite}
              data-label={splitIsSatellite ? "Mapa normal" : "Vista satelital"}
            >
              <img
                src={`${process.env.PUBLIC_URL}/satelitebw.png`}
                alt="Cambiar vista"
                className="button-icon"
              />
            </button>

            <button
              className={`map-control-button ${splitIsMeasuring ? "active" : ""}`}
              onClick={toggleSplitMeasurement}
              title={
                splitIsMeasuring ? "Terminar medición de ruta" : "Medir ruta"
              }
              aria-label="Medir ruta"
              aria-pressed={splitIsMeasuring}
              data-label={splitIsMeasuring ? "Terminar ruta" : "Trazar ruta"}
            >
              <img
                src={`${process.env.PUBLIC_URL}/rutabw.png`}
                alt="Medir ruta"
                className="button-icon"
              />
            </button>

            <button
              className={`map-control-button ${splitIsMeasuringLine ? "active" : ""}`}
              onClick={toggleSplitLineMeasurement}
              title={
                splitIsMeasuringLine
                  ? "Terminar medición línea recta"
                  : "Medir línea recta"
              }
              aria-label="Medir línea recta"
              aria-pressed={splitIsMeasuringLine}
              data-label={
                splitIsMeasuringLine ? "Terminar línea" : "Trazar línea"
              }
            >
              <div className="button-icon button-icon--glyph">⟷</div>
            </button>

            <button
              className={`map-control-button ${splitIs3D ? "active" : ""}`}
              onClick={toggleSplit3D}
              title={splitIs3D ? "Desactivar vista 3D" : "Activar vista 3D"}
              aria-label="Vista 3D"
              aria-pressed={splitIs3D}
              data-label={splitIs3D ? "Desactivar 3D" : "Vista 3D"}
            >
              <img
                src={get3DIcon(splitIs3D)}
                alt="Vista 3D"
                className="button-icon"
              />
            </button>

            {/* Brújula del mapa secundario */}
            <button
              className="map-control-button compass-btn"
              onClick={splitResetNorth}
              title="Restaurar norte"
              aria-label="Brújula: restablecer norte"
              data-label="Restaurar norte"
            >
              <svg viewBox="0 0 100 100" className="compass-svg">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="#ffffff"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="#f9fafb"
                  stroke="#d1d5db"
                  strokeWidth="1"
                />
                <text
                  x="50"
                  y="18"
                  textAnchor="middle"
                  fontSize="12"
                  fontFamily="Inter, system-ui"
                  fill="#6b7280"
                >
                  N
                </text>
                <g
                  style={{
                    transformOrigin: "50px 50px",
                    transform: `rotate(${-splitDisplayBearing}deg)`,
                  }}
                >
                  <polygon points="50,12 44,50 56,50" fill="#ef4444" />
                  <polygon points="50,88 44,50 56,50" fill="#374151" />
                  <circle cx="50" cy="50" r="4" fill="#111827" />
                </g>
              </svg>
            </button>
            </div>
          </div>

          {/* Minimapa del mapa secundario */}
          <div
            ref={splitMinimapContainerRef}
            className="minimap-container"
          />

          {/* Sidebar propio del mapa secundario: InfoBox y, debajo, sus
              propios filtros de sedes */}
          <div className="split-infobox-container">
            <InfoBox
              title="Sedes de Asambleas y Mesas de Trabajo de la Ley General de los Pueblos Indígenas y Afromexicanos"
              sections={splitInfoBoxSections}
              onToggle={handleSplitLayerToggle}
            />
            <SedesPanel
              onFilteredChange={handleSedesFiltradasSplit}
              onResetView={verTodasLasSedesSplit}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;
