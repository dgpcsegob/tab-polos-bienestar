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

type MapProps = {
  layersVisibility: { [layerId: string]: boolean };
};

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

  // Popup con clase para poder aplicar pointer-events:none desde CSS ('.ml-popup')
  const popupRef = useRef(
    new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "ml-popup",
      offset: 8,
    }),
  );

  // === Hover refs ===
  const layerHandlersRef = useRef<
    Record<string, { mouseenter: any; mousemove: any; mouseleave: any }>
  >({});
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastLngLatRef = useRef<maplibregl.LngLat | null>(null);
  const lastHoverIdRef = useRef<string | number | null>(null);

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mapView, setMapView] = useState<number>(0); // Solo setMapView se usa para forzar re-renders

  const isMeasuringRef = useRef(isMeasuring);
  const isMeasuringLineRef = useRef(isMeasuringLine);
  isMeasuringRef.current = isMeasuring;
  isMeasuringLineRef.current = isMeasuringLine;

const fixEncoding = (text: any): string => {
  if (text === null || text === undefined) return "";
  if (typeof text !== "string") return String(text);
  if (!text) return text;

  // 1. Si hay �, forzamos cambiar por í (como pediste)
  if (text.includes("�")) {
    text = text.replace(/\uFFFD/g, "í");
  }

  // 2. Reemplazar patrones típicos de UTF‑8 mal decodificado como Latin‑1
  // Ejemplos frecuentes en tiles:
  text = text
    .replace(/Ã³/g, "ó")
    .replace(/Ã©/g, "é")
    .replace(/Ã¡/g, "á")
    .replace(/Ãº/g, "ú")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã±/g, "ñ")
    .replace(/ÃÂ³/g, "ó") // por si viene doble
    .replace(/ÃÂ¡/g, "á")
    .replace(/ÃÂº/g, "ú");

  return text;
};

  const clearCurrentPoints = useCallback(() => {
    const map = mapRef.current;
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

  const clearAllRoutes = useCallback(() => {
    const map = mapRef.current;
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

    setRoutesData([]);
    setLinesData([]);
    clearCurrentPoints();
  }, [routesData, linesData, clearCurrentPoints]);

  const attachAllTooltipEvents = useCallback((map: MaplibreMap) => {
    // Popup persistente (no se cierra en pan/zoom)
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "ml-popup",
        offset: 8,
      });
    }
    const popup = popupRef.current;

    // Estado de hover real sobre alguna capa con tooltip
    let hoveringFeature = false;
    let rafId: number | null = null;

    const schedulePopupMove = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (hoveringFeature && lastLngLatRef.current) {
          popup.setLngLat(lastLngLatRef.current);
        }
      });
    };

    // Limpia handlers previos si re-adjuntamos
    Object.entries(layerHandlersRef.current).forEach(([layerId, h]) => {
      map.off("mouseenter", layerId, h.mouseenter);
      map.off("mousemove", layerId, h.mousemove);
      map.off("mouseleave", layerId, h.mouseleave);
    });
    layerHandlersRef.current = {};

    const ensureLayerHover = (
      layerId: string,
      htmlBuilder: (props: any) => string,
      idGetter?: (f: any) => string | number,
    ) => {
      const onEnter = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = "pointer";

        const feat = e.features[0];
        const props = feat.properties ?? {};
        const id = idGetter
          ? idGetter(feat)
          : (feat.id ??
            props._ID ??
            props.id ??
            `${props._NOM_REGION ?? ""}-${props.NOMGEO ?? ""}`);

        if (lastHoverIdRef.current !== id) {
          lastHoverIdRef.current = id;
          popup.setHTML(htmlBuilder(props));
        }

        lastPointRef.current = { x: e.point.x, y: e.point.y };
        lastLngLatRef.current = e.lngLat;

        // Mostrar/asegurar popup
        if (!(popup as any)._container) popup.addTo(map);
        popup.setLngLat(e.lngLat);

        hoveringFeature = true;
        schedulePopupMove();
      };

      const onMove = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
        if (!e.features?.length) return;

        const feat = e.features[0];
        const props = feat.properties ?? {};
        const id = idGetter
          ? idGetter(feat)
          : (feat.id ??
            props._ID ??
            props.id ??
            `${props._NOM_REGION ?? ""}-${props.NOMGEO ?? ""}`);

        if (lastHoverIdRef.current !== id) {
          lastHoverIdRef.current = id;
          popup.setHTML(htmlBuilder(props));
        }

        lastPointRef.current = { x: e.point.x, y: e.point.y };
        lastLngLatRef.current = e.lngLat;

        if (!(popup as any)._container) popup.addTo(map);
        schedulePopupMove();
      };

      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        lastHoverIdRef.current = null;
        lastPointRef.current = null;
        lastLngLatRef.current = null;
        hoveringFeature = false;
        popup.remove();
      };

      map.on("mouseenter", layerId, onEnter);
      map.on("mousemove", layerId, onMove);
      map.on("mouseleave", layerId, onLeave);

      layerHandlersRef.current[layerId] = {
        mouseenter: onEnter,
        mousemove: onMove,
        mouseleave: onLeave,
      };
    };

    // 🔧 IMPORTANTE: ya NO cerramos el popup en movestart/zoomstart
    // En su lugar, lo reposicionamos suavemente durante los movimientos
    const onMapMoveZoom = () => {
      if (!hoveringFeature) return;
      schedulePopupMove();
    };
    map.off("move", onMapMoveZoom);
    map.off("zoom", onMapMoveZoom);
    map.on("move", onMapMoveZoom);
    map.on("zoom", onMapMoveZoom);

    // Si el mouse sale del canvas, cerramos el popup
    const canvasEl = map.getCanvas();
    const onCanvasLeave = () => {
      hoveringFeature = false;
      popup.remove();
    };
    canvasEl.removeEventListener("mouseleave", onCanvasLeave);
    canvasEl.addEventListener("mouseleave", onCanvasLeave);

    // === Tus capas con tooltip ===
    ["regiones_zona1", "regiones_zona2"].forEach((layerId) => {
      ensureLayerHover(
        layerId,
        (props) =>
          `<div style="text-align:left;">
         <strong>Región de Paz</strong><br/>
         <strong>Entidad:</strong> ${props._NOM_ENT ?? props.NOM_ENT ?? "N/A"}<br/>
         <strong>Municipio:</strong> ${props.NOMGEO ?? props.NOM_MUN ?? "N/A"}<br/>
         <strong>Región:</strong> ${props._REGION ?? "N/A"}<br/>
         <strong>Nombre:</strong> ${props._NOM_REGION ?? "N/A"}
       </div>`,
      );
    });

    ensureLayerHover(
      "PresidenciasMunicipales",
      (props) =>
        `<strong>Entidad:</strong> ${props.NOM_ENT ?? props.entidad ?? ""}<br/>
     <strong>Municipio:</strong> ${props.NOM_MUN ?? props.municipio ?? ""}<br/>
     <strong>Dirección:</strong> ${props.direccion ?? ""}`,
    );

    ensureLayerHover(
      "LocalidadesSedeINPI",
      (props) =>
        `<strong>Entidad:</strong> ${props.NOM_ENT ?? ""}<br/>
     <strong>Municipio:</strong> ${props.NOM_MUN ?? ""}<br/>
     <strong>Localidad:</strong> ${props.NOM_LOC ?? ""}<br/>
     <strong>Pueblo:</strong> ${props.Pueblo ?? ""}`,
    );

    ensureLayerHover(
      "polosBienestar",
      (props) =>
        `<strong>PODEBIS:</strong> ${(props.layer ?? props.podebis)}<br/>
     <strong>Entidad:</strong> ${(props.entidad ?? props.NOM_ENT)}<br/>
     <strong>Publicación:</strong> ${(props.estatus)}`,
    );

    // Si usas centroides con tooltip:
    ["polosCentroides", "polosCentroides-pulse"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        ensureLayerHover(
          layerId,
          (props) =>
            `<strong>PODEBIS:</strong> ${(props.layer ?? props.podebis)}<br/>
         <strong>Entidad:</strong> ${(props.entidad ?? props.NOM_ENT)}<br/>
         <strong>Publicación:</strong> ${(props.estatus)}`,
        );
      }
    });

    ensureLayerHover(
      "SJC_Pue",
      (props) =>
        `<strong>PODEBIS:</strong> ${(props.layer ?? props.podebis) || "San José Chiapa"}<br/>
     <strong>Entidad:</strong> ${(props.entidad ?? props.NOM_ENT) || "Puebla"}<br/>
     <strong>Publicación:</strong> ${(props.estatus)}`,
    );

    ["SJC_centroides", "SJC_centroides-pulse"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        ensureLayerHover(
          layerId,
          (props) =>
            `<strong>PODEBIS:</strong> ${fixEncoding(props.layer)}<br/>
         <strong>Entidad:</strong> ${(props.entidad ?? props.NOM_ENT) || "Puebla"}<br/>
         <strong>Publicación:</strong> ${(props.estatus) || ""}`,
        );
      }
    });

    ensureLayerHover(
      "polos_topo",
      (props) =>
        `<strong>PODEBIS:</strong> ${fixEncoding(props.PODEBI) || "PODEBI Topolobampo 1"}<br/>
     <strong>Entidad:</strong> ${fixEncoding(props.Entidad ?? props.entidad) || "Sinaloa"}<br/>
     <strong>Publicación:</strong> ${fixEncoding(props.Publicacion) || "20 de marzo de 2020"}`,
    );

    ["cent_polos_topo", "cent_polos_topo-pulse"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        ensureLayerHover(
          layerId,
          (props) =>
            `<strong>PODEBIS:</strong> ${fixEncoding(props.PODEBI) || "PODEBI Topolobampo 1"}<br/>
         <strong>Entidad:</strong> ${fixEncoding(props.Entidad ?? props.entidad) || "Sinaloa"}<br/>
         <strong>Publicación:</strong> ${fixEncoding(props.Publicacion) || "20 de marzo de 2020"}`,
        );
      }
    });

    ensureLayerHover(
      "podebis_Tab_Oax_Tlaxc",
      (props) =>
        `<strong>PODEBIS:</strong> ${fixEncoding(props.PODEBI) || ""}<br/>
     <strong>Entidad:</strong> ${fixEncoding(props.CVE_ENT) || ""}<br/>
     <strong>Publicación:</strong> ${fixEncoding(props.estatus) || ""}`,
    );

    ["cent_podebis_Tab_Oax_Tlaxc", "cent_podebis_Tab_Oax_Tlaxc-pulse"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        ensureLayerHover(
          layerId,
          (props) =>
            `<strong>PODEBIS:</strong> ${fixEncoding(props.PODEBIS) || ""}<br/>
         <strong>Entidad:</strong> ${fixEncoding(props.NOM_ENT) || ""}<br/>
         <strong>Publicación:</strong> ${fixEncoding(props.estatus) || ""}`,
        );
      }
    });

    // === Click en centroide → zoom al polígono correspondiente ===
    const zoomToCentroid = (
      e: maplibregl.MapMouseEvent & { features?: any[] },
    ) => {
      if (isMeasuringRef.current || isMeasuringLineRef.current) return;
      if (!e.features?.length) return;
      const geom = e.features[0].geometry as any;
      const coords: [number, number] = geom.coordinates;
      map.flyTo({ center: coords, zoom: 13, duration: 1200 });
    };

    [
      "polosCentroides",
      "polosCentroides-pulse",
      "SJC_centroides",
      "SJC_centroides-pulse",
      "cent_polos_topo",
      "cent_polos_topo-pulse",
      "cent_podebis_Tab_Oax_Tlaxc",
      "cent_podebis_Tab_Oax_Tlaxc-pulse",
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.off("click", layerId, zoomToCentroid);
        map.on("click", layerId, zoomToCentroid);
      }
    });
  }, []);

  const addRouteToMap = useCallback(
    async (points: LngLatLike[]) => {
      const map = mapRef.current;
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
        setRoutesData((prev) => [...prev, newRouteData]);
      } catch (error) {
        console.error("Error al obtener la ruta:", error);
        alert("No se pudo calcular la ruta. Por favor, inténtelo de nuevo.");
      } finally {
        clearCurrentPoints();
        setCurrentPoints([]);
      }
    },
    [clearCurrentPoints, drawSingleRouteOnMap],
  );

  const addLineToMap = useCallback(
    (points: LngLatLike[]) => {
      const map = mapRef.current;
      if (!map) return;
      const [startPoint, endPoint] = points.map((p) => LngLat.convert(p));

      console.log("[linea] startPoint:", startPoint.lat, startPoint.lng);
      console.log("[linea] endPoint:", endPoint.lat, endPoint.lng);

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
      console.log("[linea] φ1:", φ1, "φ2:", φ2, "Δφ:", Δφ, "Δλ:", Δλ, "a:", a, "dist:", distanceKm);
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
      setLinesData((prev) => [...prev, newLineData]);
      clearCurrentPoints();
      setCurrentLinePoints([]);
    },
    [clearCurrentPoints, drawSingleLineOnMap],
  );

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
            "circle-radius": 4.5,
            "circle-color": "#a57f2c",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
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
          "circle-radius": 3,
          "circle-color": puebloExpression,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.5,
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
          "circle-radius": 2.5,
          "circle-color": "#000000",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 0.7,
        },
      });
    }

    // === Polígono de polos (≥ 11) ===
    if (!map.getSource("polosBienestar")) {
      map.addSource("polosBienestar", {
        type: "vector",
        url: "pmtiles://data/polos7.pmtiles",
      });
    }
    if (!map.getLayer("polosBienestar")) {
      map.addLayer({
        id: "polosBienestar",
        type: "fill",
        source: "polosBienestar",
        "source-layer": "polos7_tile",
        minzoom: 11,
        paint: {
          "fill-color": "rgba(155, 34, 71, 0.7)",
          "fill-outline-color": "#ffffff",
        },
      });
    }

    // === CENTROIDES DE POLOS (< 11) — ¡fuera del if de polos! ===
    if (!map.getSource("polosBienestar_centroides")) {
      map.addSource("polosBienestar_centroides", {
        type: "vector",
        url: "pmtiles://data/centroides_polos7.pmtiles",
      });
    }
    // Pulso
    if (!map.getLayer("polosCentroides-pulse")) {
      map.addLayer({
        id: "polosCentroides-pulse",
        type: "circle",
        source: "polosBienestar_centroides",
        "source-layer": "centroides_polos7_tile", // cambia si tu layer interno difiere
        maxzoom: 11, // oculto desde 11
        paint: {
          "circle-radius": 10,
          "circle-color": "#9b2247",
          "circle-opacity": 0.0,
        },
      });
    }
    // Punto base
    if (!map.getLayer("polosCentroides")) {
      map.addLayer({
        id: "polosCentroides",
        type: "circle",
        source: "polosBienestar_centroides",
        "source-layer": "centroides_polos7_tile", // cambia si tu layer interno difiere
        maxzoom: 11, // oculto desde 11
        paint: {
          "circle-radius": 4,
          "circle-color": "#9b2247",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }

    // === Polígono San José Chiapa, Pue. (≥ 11) ===
    if (!map.getSource("SJC_Pue")) {
      map.addSource("SJC_Pue", {
        type: "vector",
        url: "pmtiles://data/poligonos_SJC_Pue.pmtiles",
      });
    }
    if (!map.getLayer("SJC_Pue")) {
      map.addLayer({
        id: "SJC_Pue",
        type: "fill",
        source: "SJC_Pue",
        "source-layer": "poligonos",
        minzoom: 11,
        paint: {
          "fill-color": "rgba(155, 34, 71, 0.7)",
          "fill-outline-color": "#ffffff",
        },
      });
    }

    // === CENTROIDES SJC (< 11) ===
    if (!map.getSource("SJC_centroides")) {
      map.addSource("SJC_centroides", {
        type: "vector",
        url: "pmtiles://data/centroides_SJC.pmtiles",
      });
    }
    // Pulso
    if (!map.getLayer("SJC_centroides-pulse")) {
      map.addLayer({
        id: "SJC_centroides-pulse",
        type: "circle",
        source: "SJC_centroides",
        "source-layer": "poligonos",
        maxzoom: 11,
        paint: {
          "circle-radius": 10,
          "circle-color": "#9b2247",
          "circle-opacity": 0.0,
        },
      });
    }
    // Punto base
    if (!map.getLayer("SJC_centroides")) {
      map.addLayer({
        id: "SJC_centroides",
        type: "circle",
        source: "SJC_centroides",
        "source-layer": "poligonos",
        maxzoom: 11,
        paint: {
          "circle-radius": 4,
          "circle-color": "#9b2247",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }

        // === Polígono Topolobampo, Sin ===
    if (!map.getSource("polos_topo")) {
      map.addSource("polos_topo", {
        type: "vector",
        url: "pmtiles://data/polos_topo.pmtiles",
      });
    }
    if (!map.getLayer("polos_topo")) {
      map.addLayer({
        id: "polos_topo",
        type: "fill",
        source: "polos_topo",
        "source-layer": "polos_topo_tile",
        minzoom: 11,
        paint: {
          "fill-color": "rgba(155, 34, 71, 0.7)",
          "fill-outline-color": "#ffffff",
        },
      });
    }

    // === Centroides Topolobampo  ===
    if (!map.getSource("cent_polos_topo")) {
      map.addSource("cent_polos_topo", {
        type: "vector",
        url: "pmtiles://data/cent_polos_topo.pmtiles",
      });
    }
    // Pulso
    if (!map.getLayer("cent_polos_topo-pulse")) {
      map.addLayer({
        id: "cent_polos_topo-pulse",
        type: "circle",
        source: "cent_polos_topo",
        "source-layer": "cent_polos_topo_tile",
        maxzoom: 11,
        paint: {
          "circle-radius": 10,
          "circle-color": "#9b2247",
          "circle-opacity": 0.0,
        },
      });
    }
    // Punto base
    if (!map.getLayer("cent_polos_topo")) {
      map.addLayer({
        id: "cent_polos_topo",
        type: "circle",
        source: "cent_polos_topo",
        "source-layer": "cent_polos_topo_tile",
        maxzoom: 11,
        paint: {
          "circle-radius": 4,
          "circle-color": "#9b2247",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }

    // === Polígono PODEBIS Tab/Oax/Tlaxc (≥ 11) ===
    if (!map.getSource("podebis_Tab_Oax_Tlaxc")) {
      map.addSource("podebis_Tab_Oax_Tlaxc", {
        type: "vector",
        url: "pmtiles://data/podebis_Tab_Oax_Tlaxc.pmtiles",
      });
    }
    if (!map.getLayer("podebis_Tab_Oax_Tlaxc")) {
      map.addLayer({
        id: "podebis_Tab_Oax_Tlaxc",
        type: "fill",
        source: "podebis_Tab_Oax_Tlaxc",
        "source-layer": "podebis_Tab_Oax_Tlaxc_tile",
        minzoom: 11,
        paint: {
          "fill-color": "rgba(155, 34, 71, 0.7)",
          "fill-outline-color": "#ffffff",
        },
      });
    }

    // === Centroides PODEBIS Tab/Oax/Tlaxc (< 11) ===
    if (!map.getSource("cent_podebis_Tab_Oax_Tlaxc")) {
      map.addSource("cent_podebis_Tab_Oax_Tlaxc", {
        type: "vector",
        url: "pmtiles://data/cent_podebis_Tab_Oax_Tlaxc.pmtiles",
      });
    }
    // Pulso
    if (!map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
      map.addLayer({
        id: "cent_podebis_Tab_Oax_Tlaxc-pulse",
        type: "circle",
        source: "cent_podebis_Tab_Oax_Tlaxc",
        "source-layer": "cent_podebis_Tab_Oax_Tlaxc_tile",
        maxzoom: 11,
        paint: {
          "circle-radius": 10,
          "circle-color": "#9b2247",
          "circle-opacity": 0.0,
        },
      });
    }
    // Punto base
    if (!map.getLayer("cent_podebis_Tab_Oax_Tlaxc")) {
      map.addLayer({
        id: "cent_podebis_Tab_Oax_Tlaxc",
        type: "circle",
        source: "cent_podebis_Tab_Oax_Tlaxc",
        "source-layer": "cent_podebis_Tab_Oax_Tlaxc_tile",
        maxzoom: 11,
        paint: {
          "circle-radius": 4,
          "circle-color": "#9b2247",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
    }
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
        if (id === "polosBienestar") {
          [
            "polosCentroides", "polosCentroides-pulse",
            "SJC_Pue", "SJC_centroides", "SJC_centroides-pulse",
          ].forEach((cid) => {
            if (map.getLayer(cid)) {
              map.setLayoutProperty(cid, "visibility", vis);
            }
          });
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
          // 👉 Añadido: animar también el pulso de centroides
          if (map.getLayer("polosCentroides-pulse")) {
            map.setPaintProperty(
              "polosCentroides-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "polosCentroides-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
            );
          }
          if (map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
            map.setPaintProperty(
              "cent_podebis_Tab_Oax_Tlaxc-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "cent_podebis_Tab_Oax_Tlaxc-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
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

    const mexicoBounds: [LngLatLike, LngLatLike] = [
      [-102, 14],
      [-84, 33.5],
    ];

    const splitMap = new maplibregl.Map({
      container: splitContainerRef.current,
      style: styleUrl,
      center: currentCenter,
      zoom: currentZoom,
      pitch: currentPitch,
      bearing: currentBearing,
      attributionControl: false,
      maxBounds: mexicoBounds,
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
        "polosBienestar",
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

      // Hacer visibles los polos por defecto
      const asambleasRegionalesLayers = [
        "polosBienestar",
        "polosCentroides",
        "polosCentroides-pulse",
        "SJC_Pue",
        "SJC_centroides",
        "SJC_centroides-pulse",
        "polos_topo",
        "cent_polos_topo",
        "cent_polos_topo-pulse",
        "podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc-pulse",
      ];
      asambleasRegionalesLayers.forEach((layerId) => {
        if (splitMap.getLayer(layerId)) {
          splitMap.setLayoutProperty(layerId, "visibility", "visible");
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
        if (splitMap.getLayer("polosCentroides-pulse")) {
          splitMap.setPaintProperty(
            "polosCentroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          splitMap.setPaintProperty(
            "polosCentroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (splitMap.getLayer("SJC_centroides-pulse")) {
          splitMap.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          splitMap.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }

        if (splitMap.getLayer("cent_polos_topo-pulse")) {
          splitMap.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-radius",
            pulseRadius,
          );
          splitMap.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (splitMap.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
          splitMap.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-radius",
            pulseRadius,
          );
          splitMap.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
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
          center: splitMap.getCenter(),
          zoom: splitMap.getZoom() - 3,
          interactive: false,
          attributionControl: false,
        });
        splitMinimapRef.current = splitMinimap;

        splitMinimap.on("load", () => {
          splitMinimap.addSource("viewport-bounds", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [] },
              properties: {},
            },
          });
          splitMinimap.addLayer({
            id: "viewport-bounds-fill",
            type: "fill",
            source: "viewport-bounds",
            paint: { "fill-color": "#9f2241", "fill-opacity": 0.2 },
          });
          splitMinimap.addLayer({
            id: "viewport-bounds-outline",
            type: "line",
            source: "viewport-bounds",
            paint: { "line-color": "#9f2241", "line-width": 2 },
          });
        });

        const syncSplitMinimap = () => {
          if (!splitMinimapRef.current) return;
          const mainBounds = splitMap.getBounds();
          const boundsPolygon: Feature<Polygon> = {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  mainBounds.getSouthWest().toArray(),
                  mainBounds.getNorthWest().toArray(),
                  mainBounds.getNorthEast().toArray(),
                  mainBounds.getSouthEast().toArray(),
                  mainBounds.getSouthWest().toArray(),
                ],
              ],
            },
            properties: {},
          };
          const source = splitMinimapRef.current.getSource(
            "viewport-bounds",
          ) as GeoJSONSource;
          if (source) source.setData(boundsPolygon);

          const mapZoom = splitMap.getZoom();
          const minimapZoom = Math.max(0, mapZoom - 3);
          splitMinimapRef.current.setCenter(splitMap.getCenter());
          splitMinimapRef.current.setZoom(minimapZoom);
        };

        splitMap.on("move", syncSplitMinimap);
        splitMap.on("zoom", syncSplitMinimap);
        syncSplitMinimap();
      }

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
        // 👉 Añadido también aquí para estilos satelitales:
        if (map.getLayer("polosCentroides-pulse")) {
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
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
        if (id === "polosBienestar") {
          [
            "polosCentroides", "polosCentroides-pulse",
            "SJC_Pue", "SJC_centroides", "SJC_centroides-pulse",
          ].forEach((cid) => {
            if (map.getLayer(cid))
              map.setLayoutProperty(cid, "visibility", vis);
          });
        }
      });

      // Hacer visibles los polos por defecto
      const asambleasRegionalesLayers = [
        "polosBienestar",
        "polosCentroides",
        "polosCentroides-pulse",
        "SJC_Pue",
        "SJC_centroides",
        "SJC_centroides-pulse",
        "polos_topo",
        "cent_polos_topo",
        "cent_polos_topo-pulse",
        "podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc-pulse",
      ];
      asambleasRegionalesLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "visible");
        }
      });

      attachAllTooltipEvents(map);

      if (splitBlinkAnimationId.current)
        cancelAnimationFrame(splitBlinkAnimationId.current);
      const animateSplitPulse = (timestamp: number) => {
        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - pulseRadius / 25;
        if (map.getLayer("polosCentroides-pulse")) {
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("SJC_centroides-pulse")) {
          map.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("cent_polos_topo-pulse")) {
          map.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }

        splitBlinkAnimationId.current =
          requestAnimationFrame(animateSplitPulse);
      };
      animateSplitPulse(0);

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

        const asambleasRegionalesLayers = [
          "polosBienestar",
          "polosCentroides",
          "polosCentroides-pulse",
          "SJC_Pue",
          "SJC_centroides",
          "SJC_centroides-pulse",
          "polos_topo",
          "cent_polos_topo",
          "cent_polos_topo-pulse",
          "podebis_Tab_Oax_Tlaxc",
          "cent_podebis_Tab_Oax_Tlaxc",
          "cent_podebis_Tab_Oax_Tlaxc-pulse",
        ];
        asambleasRegionalesLayers.forEach((layerId) => {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", "visible");
          }
        });

        attachAllTooltipEvents(map);

        if (splitBlinkAnimationId.current)
          cancelAnimationFrame(splitBlinkAnimationId.current);
        const animateSplitPulse = (timestamp: number) => {
          const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
          const pulseOpacity = 1 - pulseRadius / 25;
          if (map.getLayer("polosCentroides-pulse")) {
            map.setPaintProperty(
              "polosCentroides-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "polosCentroides-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
            );
          }
          if (map.getLayer("SJC_centroides-pulse")) {
            map.setPaintProperty(
              "SJC_centroides-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "SJC_centroides-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
            );
          }
          if (map.getLayer("cent_polos_topo-pulse")) {
            map.setPaintProperty(
              "cent_polos_topo-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "cent_polos_topo-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
            );
          }
          if (map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
            map.setPaintProperty(
              "cent_podebis_Tab_Oax_Tlaxc-pulse",
              "circle-radius",
              pulseRadius,
            );
            map.setPaintProperty(
              "cent_podebis_Tab_Oax_Tlaxc-pulse",
              "circle-opacity",
              pulseOpacity * 0.5,
            );
          }

          splitBlinkAnimationId.current =
            requestAnimationFrame(animateSplitPulse);
        };
        animateSplitPulse(0);

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
    setSplitIsMeasuring((prev) => !prev);
    setSplitIsMeasuringLine(false);
  };

  const toggleSplitLineMeasurement = () => {
    setSplitIsMeasuringLine((prev) => !prev);
    setSplitIsMeasuring(false);
  };

  // Handler para cambiar visibilidad de capas en el mapa secundario
  const handleSplitLayerToggle = useCallback((id: string) => {
    setSplitLayersVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Configuración de secciones para el InfoBox del mapa secundario
  const splitInfoBoxSections: InfoBoxSection[] = [
    {
      title: "Polos",
      items: [
        {
          id: "polosBienestar",
          label: "Polos de Desarrollo para el BIENESTAR",
          color: "#9b2247",
          shape: "circle",
          switch: false,
          checked: splitLayersVisibility["polosBienestar"] ?? true,
        },
      ],
    },
    {
      title: "Comunidades Indígenas",
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
          label: "Oficinas INPI",
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
          label: "Oficinas INPI",
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
      title: "Presidencias",
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
        // También actualizar centroides y SJC si es polosBienestar
        if (id === "polosBienestar") {
          [
            "polosCentroides", "polosCentroides-pulse",
            "SJC_Pue", "SJC_centroides", "SJC_centroides-pulse",
          ].forEach((cid) => {
            if (map.getLayer(cid)) {
              map.setLayoutProperty(cid, "visibility", vis);
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
    const mexicoBounds: [LngLatLike, LngLatLike] = [
      [-120, 14],
      [-84, 33.5],
    ];

    const map = new maplibregl.Map({
      container,
      style: baseStyleUrl,
      center: [-101.14765, 23.33676],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxBounds: mexicoBounds,
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
        "polosBienestar",
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

      const asambleasRegionalesLayers = [
        "polosBienestar",
        "polosCentroides",
        "polosCentroides-pulse",
        "SJC_Pue",
        "SJC_centroides",
        "SJC_centroides-pulse",
        "polos_topo",
        "cent_polos_topo",
        "cent_polos_topo-pulse",
        "podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc",
        "cent_podebis_Tab_Oax_Tlaxc-pulse",
      ];
      asambleasRegionalesLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "visible");
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

      // 👇 AÑADIDO: animación incluye también polosCentroides-pulse desde el load
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
        if (map.getLayer("polosCentroides-pulse")) {
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "polosCentroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("SJC_centroides-pulse")) {
          map.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "SJC_centroides-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }

        if (map.getLayer("cent_polos_topo-pulse")) {
          map.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "cent_polos_topo-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }
        if (map.getLayer("cent_podebis_Tab_Oax_Tlaxc-pulse")) {
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-radius",
            pulseRadius,
          );
          map.setPaintProperty(
            "cent_podebis_Tab_Oax_Tlaxc-pulse",
            "circle-opacity",
            pulseOpacity * 0.5,
          );
        }

        blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
      };
      animateComindPulse(0);

      const minimap = new maplibregl.Map({
        container: minimapContainerRef.current as HTMLDivElement,
        style: minimapStyleUrl,
        center: map.getCenter(),
        zoom: map.getZoom() - 3,
        interactive: false,
        attributionControl: false,
      });
      minimapRef.current = minimap;

      minimap.on("load", () => {
        minimap.addSource("viewport-bounds", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [] },
            properties: {},
          },
        });
        minimap.addLayer({
          id: "viewport-bounds-fill",
          type: "fill",
          source: "viewport-bounds",
          paint: { "fill-color": "#9f2247", "fill-opacity": 0.2 },
        });
        minimap.addLayer({
          id: "viewport-bounds-outline",
          type: "line",
          source: "viewport-bounds",
          paint: { "line-color": "#9f2247", "line-width": 2 },
        });
      });

      const syncMaps = () => {
        if (!minimapRef.current) return;
        const mainBounds = map.getBounds();
        const boundsPolygon: Feature<Polygon> = {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                mainBounds.getSouthWest().toArray(),
                mainBounds.getNorthWest().toArray(),
                mainBounds.getNorthEast().toArray(),
                mainBounds.getSouthEast().toArray(),
                mainBounds.getSouthWest().toArray(),
              ],
            ],
          },
          properties: {},
        };
        const source = minimapRef.current.getSource(
          "viewport-bounds",
        ) as GeoJSONSource;
        if (source) {
          source.setData(boundsPolygon);
        }

        const mainZoom = map.getZoom();
        const minimapZoom = Math.max(0, mainZoom - 3);
        minimapRef.current.setCenter(map.getCenter());
        minimapRef.current.setZoom(minimapZoom);
      };

      map.on("move", syncMaps);
      map.on("zoom", syncMaps);
      syncMaps();

      attachAllTooltipEvents(map);

      if (!compassAnimId.current) {
        compassAnimId.current = requestAnimationFrame(animateCompass);
      }
    });

    return () => {
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

  useEffect(() => {
    if (currentPoints.length === 2) addRouteToMap(currentPoints);
  }, [currentPoints, addRouteToMap]);

  useEffect(() => {
    if (currentLinePoints.length === 2) addLineToMap(currentLinePoints);
  }, [currentLinePoints, addLineToMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const addOrUpdateAnimatedPoint = (
      id: "start" | "end",
      lngLat: LngLat,
      isLine: boolean = false,
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
      } else {
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
      }
    };

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (isMeasuring) {
        if (currentPoints.length >= 2) return;
        const newPoint = e.lngLat;
        const pointId = currentPoints.length === 0 ? "start" : "end";
        addOrUpdateAnimatedPoint(pointId, newPoint, false);
        setCurrentPoints((prev) => [...prev, newPoint]);
      } else if (isMeasuringLine) {
        if (currentLinePoints.length >= 2) return;
        const newPoint = e.lngLat;
        const pointId = currentLinePoints.length === 0 ? "start" : "end";
        addOrUpdateAnimatedPoint(pointId, newPoint, true);
        setCurrentLinePoints((prev) => [...prev, newPoint]);
      }
    };

    if (isMeasuring || isMeasuringLine) {
      map.getCanvas().style.cursor = "crosshair";
      map.on("click", handleMapClick);
    }

    return () => {
      if (map.getCanvas()) {
        map.getCanvas().style.cursor = "";
      }
      map.off("click", handleMapClick);
    };
  }, [
    isMeasuring,
    isMeasuringLine,
    currentPoints,
    currentLinePoints,
    addRouteToMap,
    addLineToMap,
  ]);

  // === Estilos inline mínimos para asegurar botones visibles ===
  const controlStackStyle: React.CSSProperties = {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  };
  const controlButtonStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "rgba(255, 255, 255, 0.88)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.7)",
    padding: 6,
    boxShadow: "0 8px 24px rgba(97, 18, 50, 0.18)",
    cursor: "pointer",
  };
  const buttonIconStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    display: "block",
  };

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

        {/* Logo institucional */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 25,
            background: "rgba(255, 255, 255, 0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.6)",
            borderRadius: "0 0 14px 14px",
            padding: "2px 2px",
            boxShadow: "0 8px 20px rgba(97, 18, 50, 0.15)",
            width: 200,
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={`${process.env.PUBLIC_URL}/logo_SEGOB.png`}
            alt="SEGOB"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
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

        {/* Controles del mapa principal */}
        <div style={controlStackStyle}>
          <button
            className={`map-control-button ${isSatellite ? "active" : ""}`}
            onClick={toggleSatellite}
            title={isSatellite ? "Volver a mapa normal" : "Ver mapa satelital"}
            aria-label="Cambiar vista"
            style={controlButtonStyle}
          >
            <img
              src={
                isSatellite
                  ? `${process.env.PUBLIC_URL}/satelitec.png`
                  : `${process.env.PUBLIC_URL}/satelitebw.png`
              }
              alt="Cambiar vista"
              className="button-icon"
              style={buttonIconStyle}
            />
          </button>

          <button
            className={`map-control-button ${isMeasuring ? "active" : ""}`}
            onClick={toggleMeasurement}
            title={isMeasuring ? "Terminar medición de ruta" : "Medir ruta"}
            aria-label="Medir ruta"
            style={controlButtonStyle}
          >
            <img
              src={
                isMeasuring
                  ? `${process.env.PUBLIC_URL}/rutac.png`
                  : `${process.env.PUBLIC_URL}/rutabw.png`
              }
              alt="Medir ruta"
              className="button-icon"
              style={buttonIconStyle}
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
            style={controlButtonStyle}
          >
            <div
              className="button-icon"
              style={{
                ...buttonIconStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: "bold",
                color: isMeasuringLine ? "#007cbf" : "#6c757d",
              }}
            >
              ⟷
            </div>
          </button>

          <button
            className={`map-control-button ${is3D ? "active" : ""}`}
            onClick={toggle3D}
            title={is3D ? "Desactivar vista 3D" : "Activar vista 3D"}
            aria-label="Vista 3D"
            style={controlButtonStyle}
          >
            <img
              src={get3DIcon(is3D)}
              alt="Vista 3D"
              className="button-icon"
              style={buttonIconStyle}
            />
          </button>

          {/* Brújula */}
          <button
            className="map-control-button compass-btn"
            onClick={resetNorth}
            title="Restaurar norte"
            aria-label="Brújula: restablecer norte"
            style={{ ...controlButtonStyle, padding: 0 }}
          >
            <svg
              viewBox="0 0 100 100"
              className="compass-svg"
              style={{ display: "block", width: "100%", height: "100%" }}
            >
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
            style={controlButtonStyle}
          >
            <img
              src={getSplitIcon(isSplitView)}
              alt="Dividir pantalla"
              className="button-icon"
              style={buttonIconStyle}
            />
          </button>
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

          {/* Controles del mapa secundario (sin botón de split) */}
          <div style={{ ...controlStackStyle, right: "20px" }}>
            <button
              className={`map-control-button ${splitIsSatellite ? "active" : ""}`}
              onClick={toggleSplitSatellite}
              title={
                splitIsSatellite ? "Volver a mapa normal" : "Ver mapa satelital"
              }
              aria-label="Cambiar vista"
              style={controlButtonStyle}
            >
              <img
                src={
                  splitIsSatellite
                    ? `${process.env.PUBLIC_URL}/satelitec.png`
                    : `${process.env.PUBLIC_URL}/satelitebw.png`
                }
                alt="Cambiar vista"
                className="button-icon"
                style={buttonIconStyle}
              />
            </button>

            <button
              className={`map-control-button ${splitIsMeasuring ? "active" : ""}`}
              onClick={toggleSplitMeasurement}
              title={
                splitIsMeasuring ? "Terminar medición de ruta" : "Medir ruta"
              }
              aria-label="Medir ruta"
              style={controlButtonStyle}
            >
              <img
                src={
                  splitIsMeasuring
                    ? `${process.env.PUBLIC_URL}/rutac.png`
                    : `${process.env.PUBLIC_URL}/rutabw.png`
                }
                alt="Medir ruta"
                className="button-icon"
                style={buttonIconStyle}
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
              style={controlButtonStyle}
            >
              <div
                className="button-icon"
                style={{
                  ...buttonIconStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  fontWeight: "bold",
                  color: splitIsMeasuringLine ? "#007cbf" : "#6c757d",
                }}
              >
                ⟷
              </div>
            </button>

            <button
              className={`map-control-button ${splitIs3D ? "active" : ""}`}
              onClick={toggleSplit3D}
              title={splitIs3D ? "Desactivar vista 3D" : "Activar vista 3D"}
              aria-label="Vista 3D"
              style={controlButtonStyle}
            >
              <img
                src={get3DIcon(splitIs3D)}
                alt="Vista 3D"
                className="button-icon"
                style={buttonIconStyle}
              />
            </button>

            {/* Brújula del mapa secundario */}
            <button
              className="map-control-button compass-btn"
              onClick={splitResetNorth}
              title="Restaurar norte"
              aria-label="Brújula: restablecer norte"
              style={{ ...controlButtonStyle, padding: 0 }}
            >
              <svg
                viewBox="0 0 100 100"
                className="compass-svg"
                style={{ display: "block", width: "100%", height: "100%" }}
              >
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

          {/* Minimapa del mapa secundario */}
          <div
            ref={splitMinimapContainerRef}
            style={{
              position: "absolute",
              bottom: "20px",
              left: "20px",
              width: "200px",
              height: "150px",
              border: "2px solid #007cbf",
              borderRadius: "8px",
              overflow: "hidden",
              boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
              zIndex: 10,
            }}
          />

          {/* InfoBox del mapa secundario */}
          <div className="split-infobox-container">
            <InfoBox
              title="Control de Capas"
              sections={splitInfoBoxSections}
              onToggle={handleSplitLayerToggle}
              initialOpen={false}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Map;
