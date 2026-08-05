import React, { useEffect, useRef, useState } from "react";
import InfoBox, { InfoBoxSection } from "./components/InfoBox/InfoBox";
import Map from "./components/Map/Map";
import { SEDE_COLORS, TIPO_ASAMBLEA, TIPO_MESA } from "./data/sedeIcons";
import "./App.css";

const App: React.FC = () => {
  // El SedesPanel vive en el árbol de <Map>, aparte de <InfoBox>: se mide su
  // alto real (cambia con el acordeón y con abrir/cerrar el panel) y se
  // publica como variable CSS para que el panel de sedes se acomode justo
  // debajo, sin traslaparse.
  const infoBoxRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = infoBoxRef.current;
    if (!el) return;
    const GAP = 12;
    const actualizarOffset = () => {
      const bottom = el.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty(
        "--left-dock-top",
        `${Math.max(bottom, 0) + GAP}px`,
      );
    };
    actualizarOffset();
    const observer = new ResizeObserver(actualizarOffset);
    observer.observe(el);
    window.addEventListener("resize", actualizarOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", actualizarOffset);
    };
  }, []);

  const [layersVisibility, setLayersVisibility] = useState<
    Record<string, boolean>
  >({
    sedesLGPI: true,
    ofrep_zona1: false,
    ofrep_zona2: false,
    regiones_zona1: false,
    regiones_zona2: false,
    LocalidadesSedeINPI: false,
    PresidenciasMunicipales: false,
  });

  const handleToggle = (id: string) => {
    setLayersVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sections: InfoBoxSection[] = [
    {
      title: "Sedes LGPI",
      items: [
        {
          // Capa base del visor: sin interruptor, siempre visible
          id: "sedesLGPI",
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
          checked: layersVisibility["LocalidadesSedeINPI"],
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
          checked: layersVisibility["ofrep_zona1"],
        },
        {
          id: "regiones_zona1",
          label: "Regiones de Paz",
          color: "#66c2a5",
          shape: "square",
          switch: true,
          checked: layersVisibility["regiones_zona1"],
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
          checked: layersVisibility["ofrep_zona2"],
        },
        {
          id: "regiones_zona2",
          label: "Regiones de Paz",
          color: "#fc8d62",
          shape: "square",
          switch: true,
          checked: layersVisibility["regiones_zona2"],
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
          checked: layersVisibility["PresidenciasMunicipales"],
        },
      ],
    },
  ];

  return (
    <div className="App">
      <InfoBox
        ref={infoBoxRef}
        title="Sedes de Asambleas y Mesas de Trabajo de la Ley General de los Pueblos Indígenas y Afromexicanos"
        sections={sections}
        onToggle={handleToggle}
      />
      <Map layersVisibility={layersVisibility} />
    </div>
  );
};

export default App;
