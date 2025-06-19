import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

type MapProps = {
  layersVisibility: { [layerId: string]: boolean };
};

const Map: React.FC<MapProps> = ({ layersVisibility }) => {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = new maplibregl.Map({
      container,
      style: 'https://api.maptiler.com/maps/01976666-b449-7252-86b5-3e7b3213a9e6/style.json?key=QAha5pFBxf4hGa8Jk5zv',
      center: [-105.15135, 23.55291],
      zoom: 4.47,
      attributionControl: false,
    });

    map.on('load', () => {
      map.addControl(new maplibregl.AttributionControl({
        customAttribution: 'Secretaría de Gobernación',
        compact: true
      }), 'bottom-right');

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

      const zonas = ['zona1', 'zona2'];
      zonas.forEach(zona => {
        map.addSource(`puntos_${zona}`, {
          type: 'vector',
          url: `pmtiles://data/puntos_${zona}.pmtiles`
        });
        map.addSource(`mesas_cercanas_${zona}`, {
          type: 'vector',
          url: `pmtiles://data/mesas_cercanas_${zona}.pmtiles`
        });
        map.addSource(`regiones_${zona}`, {
          type: 'vector',
          url: `pmtiles://data/regiones_${zona}.pmtiles`
        });

        map.addLayer({
          id: `puntos_${zona}`,
          type: 'circle',
          source: `puntos_${zona}`,
          'source-layer': `puntos_${zona}_tile`,
          paint: {
            'circle-radius': 5.5,
            'circle-color': '#e60026',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
          }
        });

        map.on('mouseenter', `puntos_${zona}`, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features?.[0]?.properties;
          if (!props) return;
          popup.setLngLat(e.lngLat).setHTML(`
            <strong>Sede:</strong> ${props.Sede || 'Sin dato'}<br/>
            <strong>Pueblo:</strong> ${props.Pueblo || 'Sin dato'}<br/>
            <strong>Regiones:</strong> ${props.Regiones || 'Sin dato'}<br/>
            <strong>Mesa:</strong> ${props.Mesa || 'Sin dato'}<br/>
            <strong>Nombre de Mesa:</strong> ${props.NomMesa || 'Sin dato'}
          `).addTo(map);
        });

        map.on('mouseleave', `puntos_${zona}`, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });

        const colorSet = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'];
        const matchValues: (string | number)[] = [];
        for (let i = 1; i <= 266; i++) {
          matchValues.push(i, colorSet[i % colorSet.length]);
        }
        const matchExpression = ['match', ['get', '_REGION'], ...matchValues, '#cccccc'] as any;

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

        map.on('mousemove', `regiones_${zona}`, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features?.[0]?.properties;
          if (!props) return;
          popup.setLngLat(e.lngLat).setHTML(`
            <strong>Entidad:</strong> ${props._NOM_ENT || 'Sin dato'}<br/>
            <strong>Municipio:</strong> ${props.NOMGEO || 'Sin dato'}<br/>
            <strong>Región:</strong> ${props._REGION || 'Sin dato'}<br/>
            <strong>Nombre Región:</strong> ${props._NOM_REGION || 'Sin dato'}
          `).addTo(map);
        });

        map.on('mouseleave', `regiones_${zona}`, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });

        map.addLayer({
          id: `mesas_cercanas_${zona}`,
          type: 'fill',
          source: `mesas_cercanas_${zona}`,
          'source-layer': `mesas_cercanas_${zona}_tile`,
          paint: {
            'fill-color': '#f8e71c',
            'fill-opacity': 0.4,
            'fill-outline-color': '#333333'
          }
        });

        map.on('mouseenter', `mesas_cercanas_${zona}`, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const props = e.features?.[0]?.properties;
          if (!props) return;
          popup.setLngLat(e.lngLat).setHTML(`
            <strong>Entidad:</strong> ${props.Entidad || 'Sin dato'}<br/>
            <strong>Región:</strong> ${props.Region || 'Sin dato'}<br/>
            <strong>Nombre Región:</strong> ${props.NomRegion || 'Sin dato'}
          `).addTo(map);
        });

        map.on('mouseleave', `mesas_cercanas_${zona}`, () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });
      });

      map.addSource('LocalidadesSedeINPI', { type: 'vector', url: 'pmtiles://data/inpi.pmtiles' });
      map.addSource('PresidenciasMunicipales', { type: 'vector', url: 'pmtiles://data/PresidenciasMunicipales.pmtiles' });
      map.addSource('PuntosWiFiCFE', { type: 'vector', url: 'pmtiles://data/PuntosWiFiCFE.pmtiles' });

      const dark2 = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'];
      
      const pueblosMatch: (string | number)[] = [];
for (let i = 1; i <= 72; i++) {
  pueblosMatch.push(i.toString(), dark2[i % dark2.length]);
}
const puebloExpression = ['match', ['get', 'ID_Pueblo'], ...pueblosMatch, '#666666'] as any;

map.addLayer({
  id: 'LocalidadesSedeINPI',
  type: 'circle',
  source: 'LocalidadesSedeINPI',
  'source-layer': 'inpi_tile',
  paint: {
    'circle-radius': 1.4,
    'circle-color': puebloExpression,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 0
  }
});

      map.on('mouseenter', 'LocalidadesSedeINPI', (e) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        popup.setLngLat(e.lngLat).setHTML(`
          <strong>Entidad:</strong> ${props.NOM_ENT}<br/>
          <strong>Municipio:</strong> ${props.NOM_MUN}<br/>
          <strong>Localidad:</strong> ${props.NOM_LOC}<br/>
          <strong>Pueblo:</strong> ${props.Pueblo}<br/>
          <strong>Población:</strong> ${props.POBTOT}<br/>
          <strong>Pobl en hogares indígenas:</strong> ${props.PHOG_IND}<br/>
          <strong>Afrodescendientes:</strong> ${props.POB_AFRO}<br/>
          <strong>Puntos WiFi:</strong> ${props.PuntosWIFI}<br/>
          <strong>Marginación:</strong> ${props.GM_2020}
        `).addTo(map);
      });

      map.on('mouseleave', 'LocalidadesSedeINPI', () => {
        popup.remove();
      });

      map.addLayer({
        id: 'PresidenciasMunicipales',
        type: 'circle',
        source: 'PresidenciasMunicipales',
        'source-layer': 'PresidenciasMunicipales_tile',
        paint: {
          'circle-radius': 1.3,
          'circle-color': '#000000'
        }
      });

      map.on('mouseenter', 'PresidenciasMunicipales', (e) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        popup.setLngLat(e.lngLat).setHTML(`
          <strong>Entidad:</strong> ${props.entidad}<br/>
          <strong>Municipio:</strong> ${props.municipio}<br/>
          <strong>Dirección:</strong> ${props.direccion}
        `).addTo(map);
      });

      map.on('mouseleave', 'PresidenciasMunicipales', () => {
        popup.remove();
      });

      const tecnologias = [
        { id: 'PuntosWiFiCFE_4G', color: '#9f2241', filtro: '4G' },
        { id: 'PuntosWiFiCFE_FIBRA', color: '#cda578', filtro: 'FIBRA O COBRE' },
        { id: 'PuntosWiFiCFE_SATELITAL', color: '#235b4e', filtro: 'SATELITAL' },
      ];

      tecnologias.forEach(({ id, color, filtro }) => {
        map.addLayer({
          id,
          type: 'circle',
          source: 'PuntosWiFiCFE',
          'source-layer': 'PuntosWiFiCFE_tile',
          filter: ['==', ['get', 'TECNOLOGIA'], filtro],
          paint: {
            'circle-radius': 1.2,
            'circle-color': color,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 0
          }
        });

        map.on('mouseenter', id, (e) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          popup.setLngLat(e.lngLat).setHTML(`
            <strong>Nombre:</strong> ${props['INMUEBLE NOMBRE']}<br/>
            <strong>Tipo:</strong> ${props['TIPO INMUEBLE']}<br/>
            <strong>AP:</strong> ${props['NOMBRE AP']}<br/>
            <strong>Tecnología:</strong> ${props['TECNOLOGIA']}
          `).addTo(map);
        });

        map.on('mouseleave', id, () => {
          popup.remove();
        });
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.entries(layersVisibility).forEach(([id, visible]) => {
      const vis = visible ? 'visible' : 'none';
      try {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', vis);
        }
      } catch {}
    });
  }, [layersVisibility]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
};

export default Map;

