import React, { useEffect, useMemo, useState } from "react";
import { SEDES_LGPI, SedeLGPI } from "../../data/sedesLGPI";
import { sedeColor, sedeIconSvg } from "../../data/sedeIcons";
import "./SedesPanel.css";

export type SedesFilters = {
  entidades: string[];
  municipios: string[];
  fechas: string[]; // iso aaaa-mm-dd
  tipos: string[];
};

const EMPTY_FILTERS: SedesFilters = {
  entidades: [],
  municipios: [],
  fechas: [],
  tipos: [],
};

type SedesPanelProps = {
  /** Se dispara con las sedes que sobreviven a los filtros activos */
  onFilteredChange: (sedes: SedeLGPI[]) => void;
  /** Encuadra todas las sedes de nuevo */
  onResetView: () => void;
  /** El panel se atenúa cuando la capa está apagada */
  disabled?: boolean;
};

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const etiquetaMes = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${capitalizar(MESES[Number(m) - 1])} ${y}`;
};
const diaDe = (iso: string) => Number(iso.slice(8, 10));

const porTexto = (a: string, b: string) => a.localeCompare(b, "es");

// Agosto y septiembre traen demasiadas fechas para una sola cuadrícula plana;
// el resto de los meses se queda como está.
const esMesConSemanas = (ym: string) => {
  const mes = ym.slice(5, 7);
  return mes === "08" || mes === "09";
};

// Número de semana ISO 8601 (lunes a domingo) de una fecha
const semanaISO = (iso: string): number => {
  const d = new Date(`${iso}T00:00:00Z`);
  const diaSemana = d.getUTCDay() || 7; // domingo (0) pasa a 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - inicioAno.getTime()) / 86400000) + 1) / 7);
};

/** Agrupa las fechas de un mes por semana ISO, en orden */
const agruparPorSemana = (dias: Opcion[]): Array<[string, Opcion[]]> => {
  const porSemana: Record<string, Opcion[]> = {};
  dias.forEach((d) => {
    const clave = `${d.valor.slice(0, 4)}-W${String(semanaISO(d.valor)).padStart(2, "0")}`;
    (porSemana[clave] = porSemana[clave] ?? []).push(d);
  });
  return Object.keys(porSemana)
    .sort()
    .map((clave) => [clave, porSemana[clave]]);
};

/** "Del 7 al 9" o "Día 7" si la semana trae un solo día */
const etiquetaSemana = (dias: Opcion[]): string => {
  const numeros = dias.map((d) => diaDe(d.valor)).sort((a, b) => a - b);
  const min = numeros[0];
  const max = numeros[numeros.length - 1];
  return min === max ? `Día ${min}` : `Del ${min} al ${max}`;
};

/** Valor disponible en un filtro y cuántas sedes tiene */
type Opcion = { valor: string; n: number };

/** Alterna un valor dentro de una lista de selección múltiple */
const toggleValor = (lista: string[], valor: string) =>
  lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

const Chevron: React.FC<{ abierto: boolean }> = ({ abierto }) => (
  <span className={`sp-chevron ${abierto ? "open" : ""}`} aria-hidden="true" />
);

/** Embudo: identifica al panel y a su botón de reaparición */
const ICONO_EMBUDO = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

/** Opción marcable con su número de sedes */
const Fila: React.FC<{
  etiqueta: React.ReactNode;
  n: number;
  activo: boolean;
  onClick: () => void;
}> = ({ etiqueta, n, activo, onClick }) => (
  <button
    className={`sp-option ${activo ? "active" : ""}`}
    onClick={onClick}
    role="checkbox"
    aria-checked={activo}
  >
    <span className="sp-check" aria-hidden="true" />
    <span className="sp-option-label">{etiqueta}</span>
    <span className="sp-count">{n}</span>
  </button>
);

/** Grupo colapsable con contador de selección */
const Grupo: React.FC<{
  titulo: string;
  seleccionados: number;
  abierto: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ titulo, seleccionados, abierto, onToggle, children }) => (
  <section className={`sp-group ${abierto ? "open" : ""}`}>
    <button className="sp-group-header" onClick={onToggle} aria-expanded={abierto}>
      <span className="sp-group-title">{titulo}</span>
      {seleccionados > 0 && <span className="sp-badge">{seleccionados}</span>}
      <Chevron abierto={abierto} />
    </button>
    <div className="sp-group-body">{children}</div>
  </section>
);

const SedesPanel: React.FC<SedesPanelProps> = ({
  onFilteredChange,
  onResetView,
  disabled = false,
}) => {
  const [abierto, setAbierto] = useState(true);
  const [filtros, setFiltros] = useState<SedesFilters>(EMPTY_FILTERS);
  // Todo arranca compactado: sólo se ven los encabezados de los cuatro filtros
  const [grupoAbierto, setGrupoAbierto] = useState<Record<string, boolean>>({});
  const [mesAbierto, setMesAbierto] = useState<Record<string, boolean>>({});
  // Clave: `${mes}__${semana}`, para no chocar entre meses
  const [semanaAbierta, setSemanaAbierta] = useState<Record<string, boolean>>({});

  const toggleGrupo = (id: string) =>
    setGrupoAbierto((prev) => ({ ...prev, [id]: !prev[id] }));

  // Coincidencia por campo; se usa para cascadear las opciones disponibles.
  const coincide = (s: SedeLGPI, f: SedesFilters, omitir?: keyof SedesFilters) =>
    (omitir === "entidades" || !f.entidades.length || f.entidades.includes(s.entidad)) &&
    (omitir === "municipios" || !f.municipios.length || f.municipios.includes(s.sede)) &&
    (omitir === "fechas" || !f.fechas.length || f.fechas.includes(s.iso)) &&
    (omitir === "tipos" || !f.tipos.length || f.tipos.includes(s.tipo));

  const filtradas = useMemo(
    () => SEDES_LGPI.filter((s) => coincide(s, filtros)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtros],
  );

  useEffect(() => {
    onFilteredChange(filtradas);
  }, [filtradas, onFilteredChange]);

  // Cada lista muestra sus opciones ya acotadas por los demás filtros, con el
  // número de sedes que quedarían al elegirlas (jerarquía entidad → municipio).
  const opciones = useMemo(() => {
    const contar = (campo: keyof SedeLGPI, omitir: keyof SedesFilters): Opcion[] => {
      const conteo: Record<string, number> = {};
      SEDES_LGPI.forEach((s) => {
        if (!coincide(s, filtros, omitir)) return;
        const v = String(s[campo]);
        conteo[v] = (conteo[v] ?? 0) + 1;
      });
      return Object.keys(conteo)
        .map((valor) => ({ valor, n: conteo[valor] }))
        .sort((a, b) => porTexto(a.valor, b.valor));
    };

    // Las fechas se agrupan por mes para no listar 21 días sueltos
    const porMes: Record<string, Opcion[]> = {};
    contar("iso", "fechas")
      .sort((a, b) => a.valor.localeCompare(b.valor))
      .forEach((f) => {
        const ym = f.valor.slice(0, 7);
        (porMes[ym] = porMes[ym] ?? []).push(f);
      });

    const meses: Array<[string, Opcion[]]> = Object.keys(porMes)
      .sort()
      .map((ym) => [ym, porMes[ym]]);

    return {
      entidades: contar("entidad", "entidades"),
      municipios: contar("sede", "municipios"),
      tipos: contar("tipo", "tipos"),
      meses,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  const activos =
    filtros.entidades.length +
    filtros.municipios.length +
    filtros.fechas.length +
    filtros.tipos.length;

  const limpiar = () => {
    setFiltros(EMPTY_FILTERS);
    onResetView();
  };

  const alternar = (campo: keyof SedesFilters, valor: string) =>
    setFiltros((prev) => {
      const siguiente = { ...prev, [campo]: toggleValor(prev[campo], valor) };
      // Al cambiar de entidad se descartan los municipios que ya no pertenecen
      // a la selección: es el nivel superior de la jerarquía.
      if (campo === "entidades" && siguiente.municipios.length) {
        const validos = new Set(
          SEDES_LGPI.filter(
            (s) =>
              !siguiente.entidades.length || siguiente.entidades.includes(s.entidad),
          ).map((s) => s.sede),
        );
        siguiente.municipios = siguiente.municipios.filter((m) => validos.has(m));
      }
      return siguiente;
    });

  // Oculto, el panel desaparece por completo y deja el botón de filtros, igual
  // que el sidebar de capas hace con su botón flotante.
  if (!abierto) {
    return (
      <button
        className="sp-reveal-btn"
        onClick={() => setAbierto(true)}
        aria-label="Mostrar filtros de sedes"
        title="Mostrar filtros de sedes"
      >
        {ICONO_EMBUDO}
        {activos > 0 && <span className="sp-reveal-badge">{activos}</span>}
      </button>
    );
  }

  return (
    <aside className={`sedes-panel ${disabled ? "disabled" : ""}`}>
      <div className="sp-header">
        <span className="sp-header-icon" aria-hidden="true">
          {ICONO_EMBUDO}
        </span>
        <span className="sp-header-text">
          <strong>Sedes</strong>
          <em>
            {filtradas.length} de {SEDES_LGPI.length} sedes
          </em>
        </span>
        {activos > 0 && <span className="sp-badge solid">{activos}</span>}
        <button
          className="sp-hide"
          onClick={() => setAbierto(false)}
          aria-label="Ocultar filtros"
          title="Ocultar panel de filtros"
        >
          <span className="sp-chev-izquierda" />
        </button>
      </div>

      <div className="sp-body">
        <Grupo
          titulo="Entidad federativa"
          seleccionados={filtros.entidades.length}
          abierto={!!grupoAbierto.entidad}
          onToggle={() => toggleGrupo("entidad")}
        >
          <div className="sp-options sp-scroll">
            {opciones.entidades.map((o) => (
              <Fila
                key={o.valor}
                etiqueta={o.valor}
                n={o.n}
                activo={filtros.entidades.includes(o.valor)}
                onClick={() => alternar("entidades", o.valor)}
              />
            ))}
          </div>
        </Grupo>

        <Grupo
          titulo="Municipio (sede)"
          seleccionados={filtros.municipios.length}
          abierto={!!grupoAbierto.municipio}
          onToggle={() => toggleGrupo("municipio")}
        >
          <div className="sp-options sp-scroll">
            {opciones.municipios.map((o) => (
              <Fila
                key={o.valor}
                etiqueta={o.valor}
                n={o.n}
                activo={filtros.municipios.includes(o.valor)}
                onClick={() => alternar("municipios", o.valor)}
              />
            ))}
          </div>
        </Grupo>

        <Grupo
          titulo="Fecha"
          seleccionados={filtros.fechas.length}
          abierto={!!grupoAbierto.fecha}
          onToggle={() => toggleGrupo("fecha")}
        >
          <div className="sp-options">
            {opciones.meses.map(([ym, dias]) => {
              const mesVisible = mesAbierto[ym] ?? false;
              const enMes = dias.filter((d) => filtros.fechas.includes(d.valor)).length;
              const todosDelMes = dias.map((d) => d.valor);
              const mesCompleto = enMes === dias.length && dias.length > 0;
              return (
                <div className={`sp-month ${mesVisible ? "open" : ""}`} key={ym}>
                  <div className="sp-month-head">
                    <button
                      className="sp-month-toggle"
                      onClick={() => setMesAbierto((p) => ({ ...p, [ym]: !mesVisible }))}
                      aria-expanded={mesVisible}
                    >
                      <Chevron abierto={mesVisible} />
                      <span>{etiquetaMes(ym)}</span>
                    </button>
                    <button
                      className={`sp-month-all ${mesCompleto ? "active" : ""}`}
                      onClick={() =>
                        setFiltros((prev) => ({
                          ...prev,
                          fechas: mesCompleto
                            ? prev.fechas.filter((f) => !todosDelMes.includes(f))
                            : prev.fechas.concat(
                                todosDelMes.filter(
                                  (f) => !prev.fechas.includes(f),
                                ),
                              ),
                        }))
                      }
                      title={mesCompleto ? "Quitar el mes" : "Seleccionar todo el mes"}
                    >
                      {mesCompleto ? "Ninguno" : "Todo"}
                    </button>
                  </div>
                  {esMesConSemanas(ym) ? (
                    <div className="sp-weeks">
                      {agruparPorSemana(dias).map(([claveSemana, diasSemana]) => {
                        const claveEstado = `${ym}__${claveSemana}`;
                        const semanaVisible = semanaAbierta[claveEstado] ?? false;
                        const enSemana = diasSemana.filter((d) =>
                          filtros.fechas.includes(d.valor),
                        ).length;
                        const todosDeSemana = diasSemana.map((d) => d.valor);
                        const semanaCompleta =
                          enSemana === diasSemana.length && diasSemana.length > 0;
                        return (
                          <div
                            className={`sp-week ${semanaVisible ? "open" : ""}`}
                            key={claveSemana}
                          >
                            <div className="sp-week-head">
                              <button
                                className="sp-week-toggle"
                                onClick={() =>
                                  setSemanaAbierta((p) => ({
                                    ...p,
                                    [claveEstado]: !semanaVisible,
                                  }))
                                }
                                aria-expanded={semanaVisible}
                              >
                                <Chevron abierto={semanaVisible} />
                                <span>{etiquetaSemana(diasSemana)}</span>
                              </button>
                              <button
                                className={`sp-month-all ${semanaCompleta ? "active" : ""}`}
                                onClick={() =>
                                  setFiltros((prev) => ({
                                    ...prev,
                                    fechas: semanaCompleta
                                      ? prev.fechas.filter(
                                          (f) => !todosDeSemana.includes(f),
                                        )
                                      : prev.fechas.concat(
                                          todosDeSemana.filter(
                                            (f) => !prev.fechas.includes(f),
                                          ),
                                        ),
                                  }))
                                }
                                title={
                                  semanaCompleta
                                    ? "Quitar la semana"
                                    : "Seleccionar toda la semana"
                                }
                              >
                                {semanaCompleta ? "Ninguno" : "Todo"}
                              </button>
                            </div>
                            <div className="sp-week-days">
                              {diasSemana.map((d) => (
                                <button
                                  key={d.valor}
                                  className={`sp-day ${filtros.fechas.includes(d.valor) ? "active" : ""}`}
                                  onClick={() => alternar("fechas", d.valor)}
                                  title={`${d.valor.split("-").reverse().join("/")} · ${d.n} sede${d.n > 1 ? "s" : ""}`}
                                >
                                  {diaDe(d.valor)}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="sp-days">
                      {dias.map((d) => (
                        <button
                          key={d.valor}
                          className={`sp-day ${filtros.fechas.includes(d.valor) ? "active" : ""}`}
                          onClick={() => alternar("fechas", d.valor)}
                          title={`${d.valor.split("-").reverse().join("/")} · ${d.n} sede${d.n > 1 ? "s" : ""}`}
                        >
                          {diaDe(d.valor)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Grupo>

        <Grupo
          titulo="Tipo de reunión"
          seleccionados={filtros.tipos.length}
          abierto={!!grupoAbierto.tipo}
          onToggle={() => toggleGrupo("tipo")}
        >
          <div className="sp-options">
            {opciones.tipos.map((o) => (
              <Fila
                key={o.valor}
                etiqueta={
                  <span className="sp-tipo">
                    <span
                      className="sp-tipo-icon"
                      style={{ color: sedeColor(o.valor) }}
                      dangerouslySetInnerHTML={{ __html: sedeIconSvg(o.valor, 15) }}
                    />
                    {o.valor}
                  </span>
                }
                n={o.n}
                activo={filtros.tipos.includes(o.valor)}
                onClick={() => alternar("tipos", o.valor)}
              />
            ))}
          </div>
        </Grupo>

        <footer className="sp-footer">
          <button className="sp-action" onClick={onResetView} title="Encuadrar todas las sedes">
            Ver todo
          </button>
          <button
            className="sp-action ghost"
            onClick={limpiar}
            disabled={activos === 0}
            title="Quitar todos los filtros"
          >
            Limpiar
          </button>
        </footer>
      </div>
    </aside>
  );
};

export default SedesPanel;
