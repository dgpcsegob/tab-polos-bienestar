import React, { useState } from 'react';
import InfoBox, { InfoBoxSection } from './components/InfoBox/InfoBox';
import Map from './components/Map/Map';
import './App.css';

const App: React.FC = () => {
  const [layersVisibility, setLayersVisibility] = useState<Record<string, boolean>>({
    puntos_zona1: true,
    puntos_zona2: true,
    mesas_cercanas_zona1: false,
    mesas_cercanas_zona2: false,
    regiones_zona1: false,
    regiones_zona2: false,
    LocalidadesSedeINPI: true,
    PresidenciasMunicipales: false,
    PuntosWiFiCFE_4G: false,
    PuntosWiFiCFE_FIBRA: false,
    PuntosWiFiCFE_SATELITAL: false,
  });

  const handleToggle = (id: string) => {
    setLayersVisibility(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sections: InfoBoxSection[] = [
    {
      title: 'Zona 1',
      items: [
        { id: 'puntos_zona1', label: 'Asambleas Regionales Zona 1', color: '#e60026', shape: 'circle', switch: true, checked: layersVisibility['puntos_zona1'] },
        { id: 'mesas_cercanas_zona1', label: 'Mesas de Paz Zona 1', color: '#f8e71c', shape: 'square', switch: true, checked: layersVisibility['mesas_cercanas_zona1'] },
        { id: 'regiones_zona1', label: 'Regiones Zona 1', color: '#66c2a5', shape: 'square', switch: true, checked: layersVisibility['regiones_zona1'] },
      ],
    },
    {
      title: 'Zona 2',
      items: [
        { id: 'puntos_zona2', label: 'Asambleas Regionales Zona 2', color: '#e60026', shape: 'circle', switch: true, checked: layersVisibility['puntos_zona2'] },
        { id: 'mesas_cercanas_zona2', label: 'Mesas de Paz Zona 2', color: '#f8e71c', shape: 'square', switch: true, checked: layersVisibility['mesas_cercanas_zona2'] },
        { id: 'regiones_zona2', label: 'Regiones Zona 2', color: '#fc8d62', shape: 'square', switch: true, checked: layersVisibility['regiones_zona2'] },
      ],
    },
    {
      title: 'Comunidades Indígenas y Afromexicanas',
      items: [
        { id: 'LocalidadesSedeINPI', label: 'Pueblos Indígenas', color: '#666666', shape: 'circle', switch: true, checked: layersVisibility['LocalidadesSedeINPI'] },
      ],
    },
    {
      title: 'Presidencias Municipales',
      items: [
        { id: 'PresidenciasMunicipales', label: 'Cabeceras Municipales', color: '#000000', shape: 'circle', switch: true, checked: layersVisibility['PresidenciasMunicipales'] },
      ],
    },
    {
      title: 'Despliegue WiFi CFE',
      items: [
        { id: 'PuntosWiFiCFE_4G', label: '4G', color: '#9f2241', shape: 'circle', switch: true, checked: layersVisibility['PuntosWiFiCFE_4G'] },
        { id: 'PuntosWiFiCFE_FIBRA', label: 'Fibra o Cobre', color: '#cda578', shape: 'circle', switch: true, checked: layersVisibility['PuntosWiFiCFE_FIBRA'] },
        { id: 'PuntosWiFiCFE_SATELITAL', label: 'Satelital', color: '#235b4e', shape: 'circle', switch: true, checked: layersVisibility['PuntosWiFiCFE_SATELITAL'] },
      ],
    },
  ];

  return (
    <div className="App">
      <InfoBox
        title="Mapa de Asambleas Regionales de Consulta"
        subtitle="Capas disponibles por zona"
        sections={sections}
        onToggle={handleToggle}
      />
      <Map layersVisibility={layersVisibility} />
    </div>
  );
};

export default App;
