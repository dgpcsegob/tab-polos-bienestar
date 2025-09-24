import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, { LngLat, LngLatLike, Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import type { Feature, Point, Geometry, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

type MapProps = {
  layersVisibility: { [layerId:string]: boolean };
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
  const color = isOn ? '#007cbf' : '#6c757d';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

const Map: React.FC<MapProps> = ({ layersVisibility }) => {
  const mapRef = useRef<MaplibreMap | null>(null);
  const minimapRef = useRef<MaplibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);

  const animationFrameId = useRef<number | null>(null);
  const blinkAnimationId = useRef<number | null>(null);
  const routeIdCounter = useRef(0);

  // Popup con clase para poder aplicar pointer-events:none desde CSS ('.ml-popup')
  const popupRef = useRef(new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'ml-popup',
    offset: 8
  }));

  // === Hover “ultra-suave” ===
  const layerHandlersRef = useRef<Record<string, { mouseenter: any; mousemove: any; mouseleave: any } >>({});
  const rafMoveRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastLngLatRef = useRef<maplibregl.LngLat | null>(null);
  const lastHoverIdRef = useRef<string | number | null>(null);
  const moveDebounceRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const slowFrameStreakRef = useRef(0);

  const PIXEL_MOVE_THRESHOLD = 3;
  const MOVE_DEBOUNCE_MS = 8;
  const SLOW_FRAME_MS = 80;
  const SLOW_STREAK_LIMIT = 2;

  // === Brújula ===
  const [displayBearing, setDisplayBearing] = useState(0);
  const displayBearingRef = useRef(0);
  const compassAnimId = useRef<number | null>(null);

  const apiKey = 'QAha5pFBxf4hGa8Jk5zv';
  const baseStyleUrl = 'https://www.mapabase.atdt.gob.mx/style.json';
  const base3DStyleUrl = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${apiKey}`;
  const satelliteStyleUrl = `https://api.maptiler.com/maps/satellite/style.json?key=${apiKey}`;
  const minimapStyleUrl = `https://api.maptiler.com/maps/dataviz-light/style.json?key=${apiKey}`;

  const [isSatellite, setIsSatellite] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isMeasuringLine, setIsMeasuringLine] = useState(false);
  const [is3D, setIs3D] = useState(false);

  const [currentPoints, setCurrentPoints] = useState<LngLatLike[]>([]);
  const [currentLinePoints, setCurrentLinePoints] = useState<LngLatLike[]>([]);
  const [routesData, setRoutesData] = useState<RouteData[]>([]);
  const [linesData, setLinesData] = useState<RouteData[]>([]);
  const [mapView, setMapView] = useState<number>(0);

  const isMeasuringRef = useRef(isMeasuring);
  const isMeasuringLineRef = useRef(isMeasuringLine);
  isMeasuringRef.current = isMeasuring;
  isMeasuringLineRef.current = isMeasuringLine;

  const clearCurrentPoints = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = [
      'start-point-current', 'start-point-current-pulse',
      'end-point-current', 'end-point-current-pulse',
      'start-point-line-current', 'start-point-line-current-pulse',
      'end-point-line-current', 'end-point-line-current-pulse'
    ];
    const sources = [
      'start-point-current', 'end-point-current',
      'start-point-line-current', 'end-point-line-current'
    ];
    layers.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    sources.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
  }, []);

  const drawSingleRouteOnMap = useCallback((map: MaplibreMap, route: RouteData) => {
    const { id, startPoint, endPoint, geometry } = route;
    if (map.getSource(`route-source-${id}`)) return;

    map.addSource(`route-source-${id}`, {
      type: 'geojson',
      data: { type: 'Feature', geometry, properties: {} }
    });

    map.addLayer({
      id: `route-layer-${id}`,
      type: 'line',
      source: `route-source-${id}`,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#007cbf', 'line-width': 5, 'line-opacity': 0.8 },
    });

    map.addSource(`start-point-${id}`, {
      type: 'geojson',
      data: { type: 'Point', coordinates: [startPoint.lng, startPoint.lat] }
    });
    map.addLayer({
      id: `start-point-${id}`,
      type: 'circle',
      source: `start-point-${id}`,
      paint: {
        'circle-radius': 6, 'circle-color': '#007cbf',
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      }
    });

    map.addSource(`end-point-${id}`, {
      type: 'geojson',
      data: { type: 'Point', coordinates: [endPoint.lng, endPoint.lat] }
    });
    map.addLayer({
      id: `end-point-${id}`,
      type: 'circle',
      source: `end-point-${id}`,
      paint: {
        'circle-radius': 6, 'circle-color': '#007cbf',
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      }
    });
  }, []);

  const drawSingleLineOnMap = useCallback((map: MaplibreMap, line: RouteData) => {
    const { id, startPoint, endPoint } = line;
    if (map.getSource(`line-source-${id}`)) return;

    const lineGeometry = {
      type: 'LineString' as const,
      coordinates: [[startPoint.lng, startPoint.lat], [endPoint.lng, endPoint.lat]]
    };

    map.addSource(`line-source-${id}`, {
      type: 'geojson',
      data: { type: 'Feature', geometry: lineGeometry, properties: {} }
    });
    map.addLayer({
      id: `line-layer-${id}`,
      type: 'line',
      source: `line-source-${id}`,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ff6b35', 'line-width': 4,
        'line-opacity': 0.8, 'line-dasharray': [2, 2]
      },
    });

    map.addSource(`start-line-point-${id}`, {
      type: 'geojson',
      data: { type: 'Point', coordinates: [startPoint.lng, startPoint.lat] }
    });
    map.addLayer({
      id: `start-line-point-${id}`,
      type: 'circle',
      source: `start-line-point-${id}`,
      paint: {
        'circle-radius': 6, 'circle-color': '#ff6b35',
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      }
    });

    map.addSource(`end-line-point-${id}`, {
      type: 'geojson',
      data: { type: 'Point', coordinates: [endPoint.lng, endPoint.lat] }
    });
    map.addLayer({
      id: `end-line-point-${id}`,
      type: 'circle',
      source: `end-line-point-${id}`,
      paint: {
        'circle-radius': 6, 'circle-color': '#ff6b35',
        'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
      }
    });
  }, []);

  const clearAllRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    routesData.forEach(route => {
      const { id } = route;
      if (map.getLayer(`route-layer-${id}`)) map.removeLayer(`route-layer-${id}`);
      if (map.getSource(`route-source-${id}`)) map.removeSource(`route-source-${id}`);
      if (map.getLayer(`start-point-${id}`)) map.removeLayer(`start-point-${id}`);
      if (map.getSource(`start-point-${id}`)) map.removeSource(`start-point-${id}`);
      if (map.getLayer(`end-point-${id}`)) map.removeLayer(`end-point-${id}`);
      if (map.getSource(`end-point-${id}`)) map.removeSource(`end-point-${id}`);
    });

    linesData.forEach(line => {
      const { id } = line;
      if (map.getLayer(`line-layer-${id}`)) map.removeLayer(`line-layer-${id}`);
      if (map.getSource(`line-source-${id}`)) map.removeSource(`line-source-${id}`);
      if (map.getLayer(`start-line-point-${id}`)) map.removeLayer(`start-line-point-${id}`);
      if (map.getSource(`start-line-point-${id}`)) map.removeSource(`start-line-point-${id}`);
      if (map.getLayer(`end-line-point-${id}`)) map.removeLayer(`end-line-point-${id}`);
      if (map.getSource(`end-line-point-${id}`)) map.removeSource(`end-line-point-${id}`);
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
      className: 'ml-popup',
      offset: 8
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
    map.off('mouseenter', layerId, h.mouseenter);
    map.off('mousemove',  layerId, h.mousemove);
    map.off('mouseleave', layerId, h.mouseleave);
  });
  layerHandlersRef.current = {};

  const ensureLayerHover = (
    layerId: string,
    htmlBuilder: (props: any) => string,
    idGetter?: (f: any) => string | number
  ) => {
    const onEnter = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = 'pointer';

      const feat = e.features[0];
      const props = feat.properties ?? {};
      const id = idGetter
        ? idGetter(feat)
        : (feat.id ?? props._ID ?? props.id ?? `${props._NOM_REGION ?? ''}-${props.NOMGEO ?? ''}`);

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
        : (feat.id ?? props._ID ?? props.id ?? `${props._NOM_REGION ?? ''}-${props.NOMGEO ?? ''}`);

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
      map.getCanvas().style.cursor = '';
      lastHoverIdRef.current = null;
      lastPointRef.current = null;
      lastLngLatRef.current = null;
      hoveringFeature = false;
      popup.remove();
    };

    map.on('mouseenter', layerId, onEnter);
    map.on('mousemove',  layerId, onMove);
    map.on('mouseleave', layerId, onLeave);

    layerHandlersRef.current[layerId] = { mouseenter: onEnter, mousemove: onMove, mouseleave: onLeave };
  };

  // 🔧 IMPORTANTE: ya NO cerramos el popup en movestart/zoomstart
  // En su lugar, lo reposicionamos suavemente durante los movimientos
  const onMapMoveZoom = () => {
    if (!hoveringFeature) return;
    schedulePopupMove();
  };
  map.off('move', onMapMoveZoom);
  map.off('zoom', onMapMoveZoom);
  map.on('move', onMapMoveZoom);
  map.on('zoom', onMapMoveZoom);

  // Si el mouse sale del canvas, cerramos el popup
  const canvasEl = map.getCanvas();
  const onCanvasLeave = () => {
    hoveringFeature = false;
    popup.remove();
  };
  canvasEl.removeEventListener('mouseleave', onCanvasLeave);
  canvasEl.addEventListener('mouseleave', onCanvasLeave);

  // === Tus capas con tooltip ===
  ['regiones_zona1', 'regiones_zona2'].forEach(layerId => {
    ensureLayerHover(layerId, (props) =>
      `<div style="text-align:left;">
         <strong>Región de Paz</strong><br/>
         <strong>Entidad:</strong> ${props._NOM_ENT ?? props.NOM_ENT ?? 'N/A'}<br/>
         <strong>Municipio:</strong> ${props.NOMGEO ?? props.NOM_MUN ?? 'N/A'}<br/>
         <strong>Región:</strong> ${props._REGION ?? 'N/A'}<br/>
         <strong>Nombre:</strong> ${props._NOM_REGION ?? 'N/A'}
       </div>`
    );
  });

  ensureLayerHover('PresidenciasMunicipales', (props) =>
    `<strong>Entidad:</strong> ${props.NOM_ENT ?? props.entidad ?? ''}<br/>
     <strong>Municipio:</strong> ${props.NOM_MUN ?? props.municipio ?? ''}<br/>
     <strong>Dirección:</strong> ${props.direccion ?? ''}`
  );

  ensureLayerHover('LocalidadesSedeINPI', (props) =>
    `<strong>Entidad:</strong> ${props.NOM_ENT ?? ''}<br/>
     <strong>Municipio:</strong> ${props.NOM_MUN ?? ''}<br/>
     <strong>Localidad:</strong> ${props.NOM_LOC ?? ''}<br/>
     <strong>Pueblo:</strong> ${props.Pueblo ?? ''}`
  );

  ensureLayerHover('polosBienestar', (props) =>
    `<strong>PODEBIS:</strong> ${props.layer ?? props.podebis ?? ''}<br/>
     <strong>Entidad:</strong> ${props.entidad ?? props.NOM_ENT ?? ''}<br/>
     <strong>Publicación:</strong> ${props.estatus ?? ''}`
  );

  // Si usas centroides con tooltip:
  ['polosCentroides', 'polosCentroides-pulse'].forEach(layerId => {
    if (map.getLayer(layerId)) {
      ensureLayerHover(layerId, (props) =>
        `<strong>PODEBIS:</strong> ${props.layer ?? props.podebis ?? ''}<br/>
         <strong>Entidad:</strong> ${props.entidad ?? props.NOM_ENT ?? ''}<br/>
         <strong>Publicación:</strong> ${props.estatus ?? ''}`
      );
    }
  });
}, []);

  const addRouteToMap = useCallback(async (points: LngLatLike[]) => {
    const map = mapRef.current;
    if (!map) return;
    const [startPoint, endPoint] = points.map(p => LngLat.convert(p));
    const startCoords = `${startPoint.lng},${startPoint.lat}`;
    const endCoords = `${endPoint.lng},${endPoint.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${startCoords};${endCoords}?overview=full&geometries=geojson`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code !== 'Ok' || data.routes.length === 0) throw new Error('No se pudo encontrar una ruta.');
      const route = data.routes[0];
      const distance = (route.distance / 1000).toFixed(2);
      const totalSeconds = route.duration;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.round((totalSeconds % 3600) / 60);
      const durationParts: string[] = [];
      if (hours > 0) durationParts.push(`${hours} hora${hours > 1 ? 's' : ''}`);
      if (minutes > 0 || durationParts.length === 0) durationParts.push(`${minutes} min`);
      const duration = durationParts.join(' ');
      const newRouteData: RouteData = {
        id: routeIdCounter.current++,
        startPoint, endPoint,
        geometry: route.geometry,
        distance, duration,
      };
      drawSingleRouteOnMap(map, newRouteData);
      setRoutesData(prev => [...prev, newRouteData]);
    } catch (error) {
      console.error('Error al obtener la ruta:', error);
      alert('No se pudo calcular la ruta. Por favor, inténtelo de nuevo.');
    } finally {
      clearCurrentPoints();
      setCurrentPoints([]);
    }
  }, [clearCurrentPoints, drawSingleRouteOnMap]);

  const addLineToMap = useCallback((points: LngLatLike[]) => {
    const map = mapRef.current;
    if (!map) return;
    const [startPoint, endPoint] = points.map(p => LngLat.convert(p));

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lat2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    const distanceKm = calculateDistance(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng);
    const distance = distanceKm.toFixed(2);

    const newLineData: RouteData = {
      id: routeIdCounter.current++,
      startPoint,
      endPoint,
      geometry: {
        type: 'LineString',
        coordinates: [[startPoint.lng, startPoint.lat], [endPoint.lng, endPoint.lat]]
      },
      distance,
      duration: 'Línea recta',
    };

    drawSingleLineOnMap(map, newLineData);
    setLinesData(prev => [...prev, newLineData]);
    clearCurrentPoints();
    setCurrentLinePoints([]);
  }, [clearCurrentPoints, drawSingleLineOnMap]);

  const addVectorLayers = (map: maplibregl.Map) => {
    const zonas = ['zona1', 'zona2'];

    zonas.forEach(zona => {
      if (!map.getSource(`ofrep_${zona}`)) {
        map.addSource(`ofrep_${zona}`, { type: 'vector', url: `pmtiles://data/or_${zona}.pmtiles` });
      }
      if (!map.getLayer(`ofrep_${zona}`)) {
        map.addLayer({
          id: `ofrep_${zona}`,
        type: 'circle',
        source: `ofrep_${zona}`,
        'source-layer': `or_${zona}_tile`,
        paint: { 'circle-radius': 4.5, 'circle-color': '#a57f2c',
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5
          }
        });
      }
      });

    zonas.forEach(zona => {

      if (!map.getSource(`regiones_${zona}`)) {
        map.addSource(`regiones_${zona}`, { type: 'vector', url: `pmtiles://data/regiones_${zona}.pmtiles` });
      }
      const colorSet = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'];
      const matchValues: (string | number)[] = [];
      for (let i = 1; i <= 266; i++) {
        matchValues.push(i, colorSet[i % colorSet.length]);
      }
      const matchExpression = ['match', ['get', '_REGION'], ...matchValues, '#cccccc'] as any;
      if (!map.getLayer(`regiones_${zona}`)) {
        map.addLayer({
          id: `regiones_${zona}`,
          type: 'fill',
          source: `regiones_${zona}`,
          'source-layer': `regiones_${zona}_tile`,
          paint: {
            'fill-color': matchExpression,
            'fill-opacity': 0.5,
            'fill-outline-color': '#333333'
          }
        });
      }
    });

    if (!map.getSource('LocalidadesSedeINPI')) {
      map.addSource('LocalidadesSedeINPI', { type: 'vector', url: 'pmtiles://data/inpi.pmtiles' });
    }
    const dark2 = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'];
    const pueblosMatch: (string | number)[] = [];
    for (let i = 1; i <= 72; i++) { pueblosMatch.push(i.toString(), dark2[i % dark2.length]); }
    const puebloExpression = ['match', ['get', 'ID_Pueblo'], ...pueblosMatch, '#666666'] as any;
    if (!map.getLayer('LocalidadesSedeINPI')) {
      map.addLayer({
        id: 'LocalidadesSedeINPI',
        type: 'circle',
        source: 'LocalidadesSedeINPI',
        'source-layer': 'inpi_tile',
        paint: {
          'circle-radius': 3, 'circle-color': puebloExpression,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': .5
        }
      });
    }

    if (!map.getSource('PresidenciasMunicipales')) {
      map.addSource('PresidenciasMunicipales', { type: 'vector', url: 'pmtiles://data/PresidenciasMunicipales.pmtiles' });
    }
    if (!map.getLayer('PresidenciasMunicipales')) {
      map.addLayer({
        id: 'PresidenciasMunicipales',
        type: 'circle',
        source: 'PresidenciasMunicipales',
        'source-layer': 'PresidenciasMunicipales_tile',
        paint: { 'circle-radius': 2.5, 'circle-color': '#000000',
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.7
         }
      });
    }

    // === Polígono de polos (≥ 11) ===
    if (!map.getSource('polosBienestar')) {
      map.addSource('polosBienestar', { type: 'vector', url: 'pmtiles://data/polos7.pmtiles' });
    }
    if (!map.getLayer('polosBienestar')) {
      map.addLayer({
        id: 'polosBienestar',
        type: 'fill',
        source: 'polosBienestar',
        'source-layer': 'polos7_tile',
        minzoom: 11,
        paint: { 'fill-color': 'rgba(155, 34, 71, 0.7)',
          'fill-outline-color': '#ffffff' }
      });
    }

    // === CENTROIDES DE POLOS (< 11) — ¡fuera del if de polos! ===
    if (!map.getSource('polosBienestar_centroides')) {
      map.addSource('polosBienestar_centroides', {
        type: 'vector',
        url: 'pmtiles://data/centroides_polos7.pmtiles'
      });
    }
    // Pulso
    if (!map.getLayer('polosCentroides-pulse')) {
      map.addLayer({
        id: 'polosCentroides-pulse',
        type: 'circle',
        source: 'polosBienestar_centroides',
        'source-layer': 'centroides_polos7_tile', // cambia si tu layer interno difiere
        maxzoom: 11, // oculto desde 11
        paint: {
          'circle-radius': 10,
          'circle-color': '#9b2247',
          'circle-opacity': 0.0
        }
      });
    }
    // Punto base
    if (!map.getLayer('polosCentroides')) {
      map.addLayer({
        id: 'polosCentroides',
        type: 'circle',
        source: 'polosBienestar_centroides',
        'source-layer': 'centroides_polos7_tile', // cambia si tu layer interno difiere
        maxzoom: 11, // oculto desde 11
        paint: {
          'circle-radius': 4,
          'circle-color': '#9b2247',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1
        }
      });
    }
  };

  const updateLayerVisibility = useCallback((map: maplibregl.Map) => {
    Object.entries(layersVisibility).forEach(([id, visible]) => {
      const vis = visible ? 'visible' : 'none';
      try {
        if (map.getLayer(id)) { map.setLayoutProperty(id, 'visibility', vis); }
      } catch {}
      if (id === 'polosBienestar') {
        ['polosCentroides', 'polosCentroides-pulse'].forEach(cid => {
          if (map.getLayer(cid)) { map.setLayoutProperty(cid, 'visibility', vis); }
        });
      }
    });
  }, [layersVisibility]);

  const applyOrRemove3DEffects = (map: any, is3DActive: boolean, isSatelliteActive: boolean) => {
    if (is3DActive) {
      try {
        if (!map.getSource('terrain-rgb')) {
          map.addSource('terrain-rgb', {
            type: 'raster-dem',
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256
          });
        }

        const exaggeration = isSatelliteActive ? 1.2 : 1.5;
        const targetPitch = isSatelliteActive ? 60 : 70;
        const sunIntensity = isSatelliteActive ? 3 : 5;

        map.setTerrain({ source: 'terrain-rgb', exaggeration });
        if (!map.getLayer('sky')) {
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0.0, 0.0],
              'sky-atmosphere-sun-intensity': sunIntensity,
            }
          } as any);
        }

        const currentPitch = map.getPitch();
        if (currentPitch < 5) {
          map.easeTo({
            pitch: targetPitch,
            bearing: map.getBearing(),
            duration: 1500,
            easing: (t: number) => t * (2 - t)
          });
        }
      } catch (error) {
        console.warn('Error aplicando efectos 3D:', error);
      }
    } else {
      try {
        const currentPitch = map.getPitch();
        if (currentPitch > 0) {
          map.easeTo({
            pitch: 0,
            duration: 1200,
            easing: (t: number) => t * (2 - t)
          }).once('moveend', () => {
            if (map.getLayer('sky')) map.removeLayer('sky');
            if (map.getTerrain()) map.setTerrain(null);
          });
        } else {
          if (map.getLayer('sky')) map.removeLayer('sky');
          if (map.getTerrain()) map.setTerrain(null);
        }
      } catch (error) {
        console.warn('Error quitando efectos 3D:', error);
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
    if (map.getLayer('sky')) map.removeLayer('sky');

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

      map.once('styledata', () => {
        addVectorLayers(map);

        if (newIs3D && !map.getSource('terrain-rgb')) {
          map.addSource('terrain-rgb', {
            type: 'raster-dem',
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256
          });
        }

        updateLayerVisibility(map);
        routesData.forEach(route => drawSingleRouteOnMap(map, route));
        linesData.forEach(line => drawSingleLineOnMap(map, line));
        attachAllTooltipEvents(map);

        if (blinkAnimationId.current) cancelAnimationFrame(blinkAnimationId.current);
        const animateComindPulse = (timestamp: number) => {
          const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
          const baseRadius = 8, maxRadius = 12;
          const currentRadius = baseRadius + (maxRadius - baseRadius) * pulseProgress;
          const baseHaloRadius = 12, maxHaloRadius = 18;
          const currentHaloRadius = baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;
          const haloOpacity = 0.1 + 0.15 * pulseProgress;
          const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
          const pulseOpacity = 1 - (pulseRadius / 25);

          if (map.getLayer('comind')) map.setPaintProperty('comind', 'circle-radius', currentRadius);
          if (map.getLayer('comind-halo')) {
            map.setPaintProperty('comind-halo', 'circle-radius', currentHaloRadius);
            map.setPaintProperty('comind-halo', 'circle-opacity', haloOpacity);
          }
          if (map.getLayer('comind-pulse')) {
            map.setPaintProperty('comind-pulse', 'circle-radius', pulseRadius);
            map.setPaintProperty('comind-pulse', 'circle-opacity', pulseOpacity * 0.4);
          }
          // 👉 Añadido: animar también el pulso de centroides
          if (map.getLayer('polosCentroides-pulse')) {
            map.setPaintProperty('polosCentroides-pulse', 'circle-radius', pulseRadius);
            map.setPaintProperty('polosCentroides-pulse', 'circle-opacity', pulseOpacity * 0.5);
          }
          blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
        };
        animateComindPulse(0);

        map.jumpTo({
          center: currentCenter,
          zoom: currentZoom,
          bearing: currentBearing,
          pitch: 0
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
      easing: (t: number) => t * (2 - t)
    });
  };

  const toggleSatellite = () => {
    const map = mapRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const was3D = is3D;
    const newIsSatellite = !isSatellite;

    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer('sky')) map.removeLayer('sky');

    setIsSatellite(newIsSatellite);

    let newStyleUrl: string;
    if (was3D) {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : base3DStyleUrl;
    } else {
      newStyleUrl = newIsSatellite ? satelliteStyleUrl : baseStyleUrl;
    }

    map.setStyle(newStyleUrl, { diff: false });

    map.once('styledata', () => {
      addVectorLayers(map);
      updateLayerVisibility(map);
      routesData.forEach(route => drawSingleRouteOnMap(map, route));
      linesData.forEach(line => drawSingleLineOnMap(map, line));
      attachAllTooltipEvents(map);

      if (blinkAnimationId.current) cancelAnimationFrame(blinkAnimationId.current);
      const animateComindPulse = (timestamp: number) => {
        const pulseProgress = (Math.sin(timestamp / 1200) + 1) / 2;
        const baseRadius = 8, maxRadius = 12;
        const currentRadius = baseRadius + (maxRadius - baseRadius) * pulseProgress;
        const baseHaloRadius = 12, maxHaloRadius = 18;
        const currentHaloRadius = baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;
        const haloOpacity = 0.1 + 0.15 * pulseProgress;
        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - (pulseRadius / 25);

        if (map.getLayer('comind')) map.setPaintProperty('comind', 'circle-radius', currentRadius);
        if (map.getLayer('comind-halo')) {
          map.setPaintProperty('comind-halo', 'circle-radius', currentHaloRadius);
          map.setPaintProperty('comind-halo', 'circle-opacity', haloOpacity);
        }
        if (map.getLayer('comind-pulse')) {
          map.setPaintProperty('comind-pulse', 'circle-radius', pulseRadius);
          map.setPaintProperty('comind-pulse', 'circle-opacity', pulseOpacity * 0.4);
        }
        // 👉 Añadido también aquí para estilos satelitales:
        if (map.getLayer('polosCentroides-pulse')) {
          map.setPaintProperty('polosCentroides-pulse', 'circle-radius', pulseRadius);
          map.setPaintProperty('polosCentroides-pulse', 'circle-opacity', pulseOpacity * 0.5);
        }

        blinkAnimationId.current = requestAnimationFrame(animateComindPulse);
      };
      animateComindPulse(0);

      map.jumpTo({
        center: currentCenter,
        zoom: currentZoom,
        bearing: currentBearing,
        pitch: 0
      });

      if (was3D) {
        if (!map.getSource('terrain-rgb')) {
          map.addSource('terrain-rgb', {
            type: 'raster-dem',
            url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${apiKey}`,
            tileSize: 256
          });
        }

        const exaggeration = newIsSatellite ? 1.2 : 1.5;
        const sunIntensity = newIsSatellite ? 3 : 5;
        const targetPitch = newIsSatellite ? 60 : 70;

        map.setTerrain({ source: 'terrain-rgb', exaggeration });
        if (!map.getLayer('sky')) {
          map.addLayer({
            id: 'sky',
            type: 'sky',
            paint: {
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun': [0, 0],
              'sky-atmosphere-sun-intensity': sunIntensity
            }
          } as any);
        }

        setTimeout(() => {
          if (map.getPitch() < 5) {
            map.easeTo({
              pitch: targetPitch,
              bearing: currentBearing,
              duration: 1500,
              easing: (t: number) => t * (2 - t)
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

  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const mexicoBounds: [LngLatLike, LngLatLike] = [[-120, 14], [-84, 33.5]];

    const map = new maplibregl.Map({
      container,
      style: baseStyleUrl,
      center: [-101.14765, 23.33676],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      maxBounds: mexicoBounds,
      maxPitch: 85
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addControl(
        new maplibregl.AttributionControl({
          customAttribution: 'Secretaría de Gobernación',
          compact: true
        }),
        'bottom-right'
      );

      if (map.getPitch() > 0) map.setPitch(0);

      addVectorLayers(map);

      const allToggleableLayers = [
        'polosBienestar', 'ofrep_zona1', 'ofrep_zona2',
        'regiones_zona1', 'regiones_zona2',
        'LocalidadesSedeINPI', 'PresidenciasMunicipales',
      ];
      allToggleableLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'none');
        }
      });

      const asambleasRegionalesLayers = ['polosBienestar'];
      asambleasRegionalesLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', 'visible');
        }
      });

      const updatePopupPositions = () => setMapView(v => v + 1);
      map.on('move', updatePopupPositions);
      map.on('zoom', updatePopupPositions);

      const animatePulse = (timestamp: number) => {
        const radius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const opacity = 1 - (radius / 25);

        ['start-point-current-pulse', 'end-point-current-pulse'].forEach(layerId => {
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'circle-radius', radius);
            map.setPaintProperty(layerId, 'circle-opacity', opacity);
          }
        });

        ['start-point-line-current-pulse', 'end-point-line-current-pulse'].forEach(layerId => {
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'circle-radius', radius);
            map.setPaintProperty(layerId, 'circle-opacity', opacity);
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
        const currentRadius = baseRadius + (maxRadius - baseRadius) * pulseProgress;

        const baseHaloRadius = 12;
        const maxHaloRadius = 18;
        const currentHaloRadius = baseHaloRadius + (maxHaloRadius - baseHaloRadius) * pulseProgress;

        const haloOpacity = 0.1 + 0.15 * pulseProgress;

        const pulseRadius = 15 * (Math.abs(Math.sin(timestamp / 500)) + 0.5);
        const pulseOpacity = 1 - (pulseRadius / 25);

        if (map.getLayer('comind')) {
          map.setPaintProperty('comind', 'circle-radius', currentRadius);
        }
        if (map.getLayer('comind-halo')) {
          map.setPaintProperty('comind-halo', 'circle-radius', currentHaloRadius);
          map.setPaintProperty('comind-halo', 'circle-opacity', haloOpacity);
        }
        if (map.getLayer('comind-pulse')) {
          map.setPaintProperty('comind-pulse', 'circle-radius', pulseRadius);
          map.setPaintProperty('comind-pulse', 'circle-opacity', pulseOpacity * 0.4);
        }
        if (map.getLayer('polosCentroides-pulse')) {
          map.setPaintProperty('polosCentroides-pulse', 'circle-radius', pulseRadius);
          map.setPaintProperty('polosCentroides-pulse', 'circle-opacity', pulseOpacity * 0.5);
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
        attributionControl: false
      });
      minimapRef.current = minimap;

      minimap.on('load', () => {
        minimap.addSource('viewport-bounds', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} }
        });
        minimap.addLayer({
          id: 'viewport-bounds-fill',
          type: 'fill',
          source: 'viewport-bounds',
          paint: { 'fill-color': '#007cbf', 'fill-opacity': 0.2 }
        });
        minimap.addLayer({
          id: 'viewport-bounds-outline',
          type: 'line',
          source: 'viewport-bounds',
          paint: { 'line-color': '#007cbf', 'line-width': 2 }
        });
      });

      const syncMaps = () => {
        if (!minimapRef.current) return;
        const mainBounds = map.getBounds();
        const boundsPolygon: Feature<Polygon> = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              mainBounds.getSouthWest().toArray(),
              mainBounds.getNorthWest().toArray(),
              mainBounds.getNorthEast().toArray(),
              mainBounds.getSouthEast().toArray(),
              mainBounds.getSouthWest().toArray()
            ]]
          },
          properties: {}
        };
        const source = minimapRef.current.getSource('viewport-bounds') as GeoJSONSource;
        if (source) { source.setData(boundsPolygon); }

        const mainZoom = map.getZoom();
        const minimapZoom = Math.max(0, mainZoom - 3);
        minimapRef.current.setCenter(map.getCenter());
        minimapRef.current.setZoom(minimapZoom);
      };

      map.on('move', syncMaps);
      map.on('zoom', syncMaps);
      syncMaps();

      attachAllTooltipEvents(map);

      if (!compassAnimId.current) {
        compassAnimId.current = requestAnimationFrame(animateCompass);
      }
    });

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (blinkAnimationId.current) cancelAnimationFrame(blinkAnimationId.current);
      if (compassAnimId.current) cancelAnimationFrame(compassAnimId.current);
      compassAnimId.current = null;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      if (minimapRef.current) { minimapRef.current.remove(); minimapRef.current = null; }
      maplibregl.removeProtocol('pmtiles');
    };
  }, [apiKey, attachAllTooltipEvents, drawSingleRouteOnMap, animateCompass]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateLayerVisibility(map);
    } else {
      map.once('styledata', () => updateLayerVisibility(map));
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

    const addOrUpdateAnimatedPoint = (id: 'start' | 'end', lngLat: LngLat, isLine: boolean = false) => {
      const prefix = isLine ? 'line-' : '';
      const sourceId = `${id}-point-${prefix}current`;
      const pointFeature: Feature<Point> = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
        properties: {}
      };
      const color = isLine ? '#ff6b35' : '#009f81';

      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as GeoJSONSource).setData(pointFeature);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: pointFeature });
        map.addLayer({
          id: `${sourceId}-pulse`,
          type: 'circle',
          source: sourceId,
          paint: { 'circle-radius': 10, 'circle-color': color, 'circle-opacity': 0.8 }
        });
        map.addLayer({
          id: sourceId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': 6, 'circle-color': color,
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff'
          }
        });
      }
    };

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (isMeasuring) {
        if (currentPoints.length >= 2) return;
        const newPoint = e.lngLat;
        const pointId = currentPoints.length === 0 ? 'start' : 'end';
        addOrUpdateAnimatedPoint(pointId, newPoint, false);
        setCurrentPoints(prev => [...prev, newPoint]);
      } else if (isMeasuringLine) {
        if (currentLinePoints.length >= 2) return;
        const newPoint = e.lngLat;
        const pointId = currentLinePoints.length === 0 ? 'start' : 'end';
        addOrUpdateAnimatedPoint(pointId, newPoint, true);
        setCurrentLinePoints(prev => [...prev, newPoint]);
      }
    };

    if (isMeasuring || isMeasuringLine) {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', handleMapClick);
    }

    return () => {
      if (map.getCanvas()) {
        map.getCanvas().style.cursor = '';
      }
      map.off('click', handleMapClick);
    };
  }, [isMeasuring, isMeasuringLine, currentPoints, currentLinePoints, addRouteToMap, addLineToMap]);

  // === Estilos inline mínimos para asegurar botones visibles ===
  const controlStackStyle: React.CSSProperties = {
    position: 'absolute', top: '20px', right: '20px', zIndex: 20,
    display: 'flex', flexDirection: 'column', gap: '10px'
  };
  const controlButtonStyle: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 9999, background: '#ffffff',
    border: '1px solid #e5e7eb', padding: 6, boxShadow: '0 6px 16px rgba(0,0,0,0.08)', cursor: 'pointer'
  };
  const buttonIconStyle: React.CSSProperties = { width: 24, height: 24, display: 'block' };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Logo institucional */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        background: 'rgba(255, 255, 255, 0.3)',
        backdropFilter: 'blur(8px)',
        borderRadius: 12,
        padding: '2px 2px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        width: 200,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <img
          src={`${process.env.PUBLIC_URL}/logo_SEGOB.png`}
          alt="SEGOB"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>

      <div className="custom-popup-container">
        {routesData.map(route => {
          if (!mapRef.current) return null;
          const screenPoint = mapRef.current.project(route.endPoint);
          return (
            <div
              key={route.id}
              className="custom-route-popup"
              style={{ left: `${screenPoint.x}px`, top: `${screenPoint.y}px` }}
            >
              <strong>Distancia:</strong> {route.distance} km<br/>
              <strong>Tiempo:</strong> {route.duration}
            </div>
          );
        })}
        {linesData.map(line => {
          if (!mapRef.current) return null;
          const screenPoint = mapRef.current.project(line.endPoint);
          return (
            <div
              key={`line-${line.id}`}
              className="custom-route-popup"
              style={{
                left: `${screenPoint.x}px`,
                top: `${screenPoint.y}px`,
                backgroundColor: '#ff6b35',
                color: '#ffffff'
              }}
            >
              <strong>Distancia:</strong> {line.distance} km<br/>
              <strong>Tipo:</strong> {line.duration}
            </div>
          );
        })}
      </div>

      <div style={controlStackStyle}>
        <button
          className={`map-control-button ${isSatellite ? 'active' : ''}`}
          onClick={toggleSatellite}
          title={isSatellite ? 'Volver a mapa normal' : 'Ver mapa satelital'}
          aria-label="Cambiar vista"
          style={controlButtonStyle}
        >
          <img
            src={isSatellite ? `${process.env.PUBLIC_URL}/satelitec.png` : `${process.env.PUBLIC_URL}/satelitebw.png`}
            alt="Cambiar vista"
            className="button-icon"
            style={buttonIconStyle}
          />
        </button>

        <button
          className={`map-control-button ${isMeasuring ? 'active' : ''}`}
          onClick={toggleMeasurement}
          title={isMeasuring ? 'Terminar medición de ruta' : 'Medir ruta'}
          aria-label="Medir ruta"
          style={controlButtonStyle}
        >
          <img
            src={isMeasuring ? `${process.env.PUBLIC_URL}/rutac.png` : `${process.env.PUBLIC_URL}/rutabw.png`}
            alt="Medir ruta"
            className="button-icon"
            style={buttonIconStyle}
          />
        </button>

        <button
          className={`map-control-button ${isMeasuringLine ? 'active' : ''}`}
          onClick={toggleLineMeasurement}
          title={isMeasuringLine ? 'Terminar medición línea recta' : 'Medir línea recta'}
          aria-label="Medir línea recta"
          style={controlButtonStyle}
        >
          <div
            className="button-icon"
            style={{
              ...buttonIconStyle,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 'bold',
              color: isMeasuringLine ? '#007cbf' : '#6c757d'
            }}
          >
            ⟷
          </div>
        </button>

        <button
          className={`map-control-button ${is3D ? 'active' : ''}`}
          onClick={toggle3D}
          title={is3D ? 'Desactivar vista 3D' : 'Activar vista 3D'}
          aria-label="Vista 3D"
          style={controlButtonStyle}
        >
          <img src={get3DIcon(is3D)} alt="Vista 3D" className="button-icon" style={buttonIconStyle}/>
        </button>

        {/* Brújula */}
        <button
          className="map-control-button compass-btn"
          onClick={resetNorth}
          title="Restaurar norte"
          aria-label="Brújula: restablecer norte"
          style={{ ...controlButtonStyle, padding: 0 }}
        >
          <svg viewBox="0 0 100 100" className="compass-svg" style={{ display: 'block', width: '100%', height: '100%' }}>
            <circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#e5e7eb" strokeWidth="4" />
            <circle cx="50" cy="50" r="42" fill="#f9fafb" stroke="#d1d5db" strokeWidth="1" />
            <text x="50" y="18" textAnchor="middle" fontSize="12" fontFamily="Inter, system-ui" fill="#6b7280">N</text>
            <g style={{ transformOrigin: '50px 50px', transform: `rotate(${-displayBearing}deg)` }}>
              <polygon points="50,12 44,50 56,50" fill="#ef4444" />
              <polygon points="50,88 44,50 56,50" fill="#374151" />
              <circle cx="50" cy="50" r="4" fill="#111827" />
            </g>
          </svg>
        </button>
      </div>

      <div ref={minimapContainerRef} className="minimap-container" />
    </div>
  );
};

export default Map;
