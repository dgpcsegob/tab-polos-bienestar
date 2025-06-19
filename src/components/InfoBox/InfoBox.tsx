
// InfoBox.tsx limpio sin advertencias de variables no usadas
import React, { useRef, useEffect, useState } from 'react';
import './InfoBox.css'; 

type LegendItem = {
  id: string;
  label: string;
  color: string;
  shape: 'circle' | 'square';
  size?: number;
  switch?: boolean;
  defaultChecked?: boolean;
  checked?: boolean;
  isButton?: boolean;
  active?: boolean;
  onClick?: () => void;
};

export type InfoBoxSection = {
  title: string;
  switch?: boolean;
  defaultChecked?: boolean;
  items: LegendItem[];
};

type InfoBoxProps = {
  title: string;
  subtitle?: string;
  sections: InfoBoxSection[];
  onToggle?: (label: string) => void;
};

const InfoBox: React.FC<InfoBoxProps> = ({ title, subtitle, sections, onToggle }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {}, [title, subtitle]);

  return (
    <div className={`info-box ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="info-box-header" ref={headerRef}>
        {!isCollapsed && (
          <>
            <h2>{title}</h2>
            {subtitle && <p className="info-box-subtitle">{subtitle}</p>}
          </>
        )}
        <button
          className="hamburger"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expandir panel' : 'Colapsar panel'}
        >
          {isCollapsed ? '☰' : '☰'}
        </button>
      </div>

      {!isCollapsed && sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="legend-section">
          <div className="legend-title-container">
            <span className="legend-title">{section.title}</span>
          </div>
          {section.items.map((item, itemIndex) => (
            <div key={itemIndex} className="legend-row">
              {!item.isButton && (
                <>
                  <div
                    className={`shape ${item.shape}`}
                    style={{ backgroundColor: item.color, width: 12, height: 12 }}
                  ></div>
                  <span style={{ fontSize: '12px' }}>{item.label}</span>
                  {item.switch && (
                    <label className="switch">
                      <input
                        type="checkbox"
                        onChange={() => onToggle && onToggle(item.id)}
                        checked={item.checked}
                      />
                      <span className="slider"></span>
                    </label>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default InfoBox;
