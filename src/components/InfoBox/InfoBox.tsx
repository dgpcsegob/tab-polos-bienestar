import React, { useState } from 'react';
import './InfoBox.css';

type LegendItem = {
  id: string;
  label: string;
  color?: string;
  shape?: 'circle' | 'square';
  size?: number;
  switch?: boolean;   // si lleva switch
  checked?: boolean;  // estado desde el padre
};

export type InfoBoxSection = {
  title: string;
  items: LegendItem[];
};

type InfoBoxProps = {
  title: string;
  subtitle?: string;
  sections: InfoBoxSection[];
  onToggle?: (id: string) => void;
  initialOpen?: boolean;
};

/** Botón neumórfico de encendido/apagado (power button) */
const PowerToggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    title={checked ? 'Apagar capa' : 'Encender capa'}
    className={`power-toggle ${checked ? 'on' : ''}`}
    onClick={onChange}
  >
    <span className="power-cap">
      <span className={`power-icon ${checked ? 'circle' : 'bar'}`} aria-hidden="true" />
    </span>
  </button>
);

const InfoBox = React.forwardRef<HTMLElement, InfoBoxProps>(({
  title,
  subtitle,
  sections,
  onToggle,
  initialOpen = true,
}, ref) => {
  const [open, setOpen] = useState(initialOpen);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const toggleSection = (idx: number) =>
    setCollapsed((prev) => ({ ...prev, [idx]: !prev[idx] }));

  // Total de capas con switch encendidas (para el footer)
  const activeCount = sections.reduce(
    (acc, s) => acc + s.items.filter((i) => i.switch && i.checked).length,
    0,
  );

  return (
    <>
      {/* Botón flotante cuando el panel está oculto */}
      {!open && (
        <button
          className="floating-reveal-btn"
          onClick={() => setOpen(true)}
          aria-label="Mostrar panel de capas"
          title="Mostrar panel de capas"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>
      )}

      <aside
        ref={ref}
        className={`info-box ${open ? 'open' : 'closed'}`}
        aria-hidden={!open}
      >
        <header className="info-header">
          <div className="titles">
            <h2 className="info-title">{title}</h2>
            <p className="info-subtitle">{subtitle ?? 'D G P C'}</p>
          </div>

          <button
            className="side-toggle"
            onClick={() => setOpen(false)}
            aria-label="Ocultar panel"
            title="Ocultar panel"
          >
            <span className="chev left" />
          </button>
        </header>

        <div className="info-content">
          {sections.map((section, sIdx) => {
            const isCollapsed = !!collapsed[sIdx];
            const switchables = section.items.filter((i) => i.switch);
            const activeInSection = switchables.filter((i) => i.checked).length;

            return (
              <section
                className={`legend-section ${isCollapsed ? 'collapsed' : ''}`}
                key={sIdx}
              >
                <button
                  className="legend-header"
                  onClick={() => toggleSection(sIdx)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="legend-accent" aria-hidden="true" />
                  <span className="legend-title">{section.title}</span>
                  {activeInSection > 0 && (
                    <span className="legend-badge">{activeInSection}</span>
                  )}
                  <span
                    className={`legend-chevron ${isCollapsed ? '' : 'expanded'}`}
                    aria-hidden="true"
                  />
                </button>

                <div className="legend-items-wrap">
                  <div className="legend-items">
                    {section.items.map((item) => (
                      <div
                        className={`legend-row ${item.switch && !item.checked ? 'inactive' : ''}`}
                        key={item.id}
                      >
                        {item.shape && item.color && (
                          <span
                            className={`shape ${item.shape}`}
                            style={{ backgroundColor: item.color }}
                          />
                        )}

                        <span className="legend-label">{item.label}</span>

                        {item.switch && (
                          <PowerToggle
                            checked={!!item.checked}
                            onChange={() => onToggle && onToggle(item.id)}
                            ariaLabel={`Activar/Desactivar ${item.label}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <footer className="info-footer">
          <span
            className={`footer-dot ${activeCount > 0 ? 'on' : ''}`}
            aria-hidden="true"
          />
          <span>
            {activeCount === 0
              ? 'Sin capas adicionales activas'
              : `${activeCount} capa${activeCount > 1 ? 's' : ''} adicional${activeCount > 1 ? 'es' : ''} activa${activeCount > 1 ? 's' : ''}`}
          </span>
        </footer>
      </aside>
    </>
  );
});

export default InfoBox;
