import React, { useState } from 'react';
import InfoBox, { InfoBoxSection } from './components/InfoBox/InfoBox';
import Map from './components/Map/Map';
import './App.css';

const App: React.FC = () => {
  const [layersVisibility, setLayersVisibility] = useState<Record<string, boolean>>({
    polosBienestar: true,
    ofrep_zona1: false,
    ofrep_zona2: false,
    regiones_zona1: false,
    regiones_zona2: false,
    LocalidadesSedeINPI: false,
    PresidenciasMunicipales: false,
  });

  const handleToggle = (id: string) => {
    setLayersVisibility(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sections: InfoBoxSection[] = [
    {
      title: 'Polos',
      items: [
        { id: 'polosBienestar', label: 'Polos de Desarrollo para el BIENESTAR', color: '#9b2247', shape: 'circle', switch: false, checked: layersVisibility['polosBienestar'] },
      ],
    },
    {
    title: 'Comunidades Indígenas y Afromexicanas',
    items: [
      { id: 'LocalidadesSedeINPI', label: 'Pueblos Indígenas', color: '#666666', shape: 'circle', switch: true, checked: layersVisibility['LocalidadesSedeINPI'] },
    ],
     },
    {
      title: 'Zona 1 - NORTE',
      items: [
        { id: 'ofrep_zona1', label: 'Oficinas de Representación INPI cambiar capa', color: '#a57f2c', shape: 'circle', switch: true, checked: layersVisibility['ofrep_zona1'] },
        { id: 'regiones_zona1', label: 'Regiones de Paz', color: '#66c2a5', shape: 'square', switch: true, checked: layersVisibility['regiones_zona1'] },
      ],
    },
    {
      title: 'Zona 2 - SUR',
      items: [
        { id:'ofrep_zona2', label: 'Oficinas de Representación INPI cambiar capa', color: '#a57f2c', shape: 'circle', switch: true, checked: layersVisibility['ofrep_zona2'] },
        { id: 'regiones_zona2', label: 'Regiones de Paz', color: '#fc8d62', shape: 'square', switch: true, checked: layersVisibility['regiones_zona2'] },
      ],
    },

    {
      title: 'Presidencias Municipales',
      items: [
        { id: 'PresidenciasMunicipales', label: 'Cabeceras Municipales', color: '#000000', shape: 'circle', switch: true, checked: layersVisibility['PresidenciasMunicipales'] },
      ],
    },
  ];

  return (
    <div className="App">
      <InfoBox
        title="Polos de Desarrollo del BIENESTAR"
        sections={sections}
        onToggle={handleToggle}
      />
      <Map layersVisibility={layersVisibility} />
    </div>
  );
};

export default App;
