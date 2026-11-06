import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, Row } from './api';
import { Badge, Notice, short } from './components';

export interface ContractTemplatesManagerProps {
  revision: number;
  onChanged?: () => void;
}

export const ALLOWED_VARIABLES = [
  { key: '{{nombre}}', label: 'Nombre del funcionario', desc: 'Nombre y apellidos del funcionario' },
  { key: '{{cargo}}', label: 'Cargo asignado', desc: 'Denominación del puesto o cargo laboral' },
  { key: '{{salario}}', label: 'Salario vigente', desc: 'Monto de remuneración vigente' },
  { key: '{{fecha_ingreso}}', label: 'Fecha de ingreso', desc: 'Fecha de inicio de relación laboral (YYYY-MM-DD)' },
  { key: '{{periodo_prueba_dias}}', label: 'Días de prueba', desc: 'Duración del periodo de prueba en días' },
];

export default function ContractTemplatesManager({
  revision,
  onChanged,
}: ContractTemplatesManagerProps) {
  const [templates, setTemplates] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Row | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [invalidTokens, setInvalidTokens] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cargar catálogo de plantillas
  const loadTemplates = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await api('contracts/templates');
      const list = Array.isArray(data) ? data : (data?.items || []);
      setTemplates(list);
      if (list.length > 0 && !selectedTemplate && !isCreatingNew) {
        selectTemplate(list[0]);
      }
    } catch (err) {
      setLoadError((err as Error).message || 'No fue posible cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [revision]);

  function selectTemplate(t: Row) {
    setIsCreatingNew(false);
    setSelectedTemplate(t);
    setTitle(t.title || '');
    setBody(t.body || '');
    setErrorMsg('');
    setInvalidTokens([]);
    setSuccessMsg('');
  }

  function startNewTemplate() {
    setIsCreatingNew(true);
    setSelectedTemplate(null);
    setTitle('');
    setBody('En la ciudad de La Paz, se celebra el presente contrato de trabajo entre ARCA LTDA. y el funcionario {{nombre}}, quien desempeñará el cargo de {{cargo}} con un salario de {{salario}} BOB a partir del {{fecha_ingreso}}, sujeto a un periodo de prueba de {{periodo_prueba_dias}} días.');
    setErrorMsg('');
    setInvalidTokens([]);
    setSuccessMsg('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Inserción rápida de variables en el cursor
  function insertVariable(variableKey: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody(prev => prev + ' ' + variableKey);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const newBody = body.substring(0, start) + variableKey + body.substring(end);
    setBody(newBody);

    setTimeout(() => {
      el.focus();
      const pos = start + variableKey.length;
      el.setSelectionRange(pos, pos);
    }, 10);
  }

  // Agrupar plantillas por título para el historial de versiones en el panel lateral
  const groupedTemplates = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const t of templates) {
      const key = t.title || 'Sin título';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Ordenar versiones de mayor a menor dentro de cada grupo
    map.forEach(list => list.sort((a, b) => (b.version || 0) - (a.version || 0)));
    return Array.from(map.entries());
  }, [templates]);

  // Detección en cliente de posibles variables no permitidas o scripts
  function detectClientErrors(text: string): string[] {
    const tokens: string[] = [];
    const varMatches = Array.from(text.matchAll(/{{\s*([^{}]+?)\s*}}/g));
    const allowed = new Set(ALLOWED_VARIABLES.map(v => v.key.replace(/[{}]/g, '').trim()));

    for (const m of varMatches) {
      const key = m[1].trim();
      if (!allowed.has(key)) {
        tokens.push(`{{${key}}}`);
      }
    }

    if (/<script/i.test(text)) tokens.push('<script>');
    if (/javascript:/i.test(text)) tokens.push('javascript:');
    if (/https?:\/\//i.test(text)) tokens.push('URL');

    return tokens;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle) {
      setErrorMsg('Debe especificar un título para la plantilla.');
      return;
    }
    if (!trimmedBody) {
      setErrorMsg('El cuerpo de la plantilla no puede estar vacío.');
      return;
    }

    const detected = detectClientErrors(trimmedBody);
    if (detected.length > 0) {
      setInvalidTokens(detected);
      setErrorMsg('La plantilla contiene variables no permitidas o código no sanitizado');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    setInvalidTokens([]);
    setSuccessMsg('');

    try {
      if (isCreatingNew || !selectedTemplate) {
        // POST /contracts/templates (v1)
        const created = await api('contracts/templates', 'POST', {
          title: trimmedTitle,
          body: trimmedBody,
        });
        setSuccessMsg(`Plantilla "${created.title}" (v${created.version}) creada exitosamente.`);
        setIsCreatingNew(false);
        setSelectedTemplate(created);
      } else {
        // PUT /contracts/templates/:id (versionado o actualización)
        const saved = await api(`contracts/templates/${selectedTemplate.id}`, 'PUT', {
          title: trimmedTitle,
          body: trimmedBody,
        });
        if (saved.version > selectedTemplate.version) {
          setSuccessMsg(`Nueva versión generada: "${saved.title}" (v${saved.version}) preservando la v${selectedTemplate.version} histórica.`);
        } else {
          setSuccessMsg(`Plantilla "${saved.title}" (v${saved.version}) actualizada correctamente.`);
        }
        setSelectedTemplate(saved);
      }
      await loadTemplates();
      onChanged?.();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : (err.message || 'Error al guardar la plantilla');
      setErrorMsg(msg);
      if (err.status === 422 || msg.includes('no permitidas') || msg.includes('no sanitizado')) {
        const found = detectClientErrors(trimmedBody);
        setInvalidTokens(found.length > 0 ? found : ['Sintaxis de variable no permitida o contenido no sanitizado']);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card contract-templates-manager">
      <div className="toolbar">
        <div>
          <span className="eyebrow">CONTROL DE VERSIONES Y PARÁMETROS (HU-18)</span>
          <h3>Administrador de Plantillas de Contrato</h3>
          <p className="muted">
            Configure plantillas parametrizables con versionado automático y protección contra inyecciones.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={startNewTemplate}
          disabled={busy}
        >
          + Nueva Plantilla
        </button>
      </div>

      <Notice loading={loading} error={loadError} />

      <div className="templates-layout">
        {/* PANEL LATERAL: Catálogo e Historial de Versiones */}
        <aside className="templates-sidebar">
          <div className="sidebar-header">
            <strong>Catálogo e Historial</strong>
            <small className="muted">{templates.length} versión{templates.length === 1 ? '' : 'es'}</small>
          </div>

          {groupedTemplates.length === 0 && !loading && (
            <p className="empty" style={{ padding: '16px' }}>
              No hay plantillas registradas. Cree la primera versión.
            </p>
          )}

          <div className="templates-tree">
            {groupedTemplates.map(([groupTitle, versions]) => (
              <div key={groupTitle} className="template-group">
                <div className="group-title">
                  <span>📄 {groupTitle}</span>
                </div>
                <ul className="version-list">
                  {versions.map(v => {
                    const isSelected = selectedTemplate?.id === v.id && !isCreatingNew;
                    const isActive = v.status === 'ACTIVE';
                    return (
                      <li
                        key={v.id}
                        className={`version-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => selectTemplate(v)}
                      >
                        <div className="version-meta">
                          <span className="version-number">v{v.version}</span>
                          <span className={`badge ${isActive ? 'green' : ''}`}>
                            {isActive ? 'ACTIVA' : 'CONSERVADA'}
                          </span>
                        </div>
                        <small className="muted">{short(v.updatedAt || v.createdAt)}</small>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL: Editor Interactivo de Texto */}
        <div className="templates-editor-panel">
          <form className="template-editor-form" onSubmit={handleSave}>
            <div className="editor-heading">
              <div>
                <h4>
                  {isCreatingNew
                    ? 'Nueva Plantilla (v1 inicial)'
                    : `Editando: ${selectedTemplate?.title || 'Plantilla'} · Versión ${selectedTemplate?.version || 1}`}
                </h4>
                <p className="muted">
                  {isCreatingNew
                    ? 'Al guardar se registrará con versión 1 y estado ACTIVA.'
                    : 'Si esta versión ya fue emitida en contratos, al guardar se generará automáticamente v' + ((selectedTemplate?.version || 1) + 1) + ' preservando el historial.'}
                </p>
              </div>

              {!isCreatingNew && selectedTemplate && (
                <div className="status-indicator">
                  <Badge value={selectedTemplate.status || 'ACTIVE'} />
                </div>
              )}
            </div>

            {/* Mensajes de éxito y error */}
            {successMsg && <p className="success" role="status">{successMsg}</p>}

            {/* MANEJO CONTEXTUAL DE ERRORES HTTP 422 */}
            {errorMsg && (
              <div className="notice error template-422-alert" role="alert">
                <strong>⚠️ {errorMsg}</strong>
                {invalidTokens.length > 0 && (
                  <div className="invalid-tokens-list">
                    <span>Variables o elementos rechazados: </span>
                    {invalidTokens.map((tok, idx) => (
                      <code key={idx} className="token-pill">{tok}</code>
                    ))}
                  </div>
                )}
                <small style={{ display: 'block', marginTop: '6px' }}>
                  Solo se admiten texto plano y las 5 variables institucionales:
                  {' '}<code>{'{{nombre}}'}</code>, <code>{'{{cargo}}'}</code>, <code>{'{{salario}}'}</code>, <code>{'{{fecha_ingreso}}'}</code>, <code>{'{{periodo_prueba_dias}}'}</code>.
                </small>
              </div>
            )}

            <label>
              Título de la plantilla *
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. Contrato Individual de Trabajo a Plazo Fijo"
                required
                disabled={busy}
              />
            </label>

            {/* BOTONES DE INSERCIÓN RÁPIDA DE VARIABLES PERMITIDAS */}
            <div className="quick-insert-toolbar">
              <span className="toolbar-label">Variables institucionales permitidas:</span>
              <div className="quick-buttons">
                {ALLOWED_VARIABLES.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    className="button-var"
                    onClick={() => insertVariable(v.key)}
                    title={`${v.label}: ${v.desc}`}
                    disabled={busy}
                  >
                    + {v.key}
                  </button>
                ))}
              </div>
            </div>

            <label>
              Cuerpo del contrato parametrizable *
              <textarea
                ref={textareaRef}
                rows={12}
                value={body}
                onChange={e => {
                  setBody(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Escriba las cláusulas contractuales insertando las variables correspondientes..."
                required
                disabled={busy}
                className="template-textarea"
              />
            </label>

            {/* Previsualización contextual */}
            <details className="preview-accordion">
              <summary>Vista previa interactiva con datos de muestra</summary>
              <div className="preview-box">
                <pre>
                  {body
                    .replace(/{{\s*nombre\s*}}/g, 'JUAN CARLOS PÉREZ')
                    .replace(/{{\s*cargo\s*}}/g, 'ANALISTA DE DESARROLLO')
                    .replace(/{{\s*salario\s*}}/g, '8500.00')
                    .replace(/{{\s*fecha_ingreso\s*}}/g, '2026-03-01')
                    .replace(/{{\s*periodo_prueba_dias\s*}}/g, '90')}
                </pre>
              </div>
            </details>

            <div className="actions" style={{ marginTop: '16px', justifyContent: 'flex-end' }}>
              {isCreatingNew ? (
                <button
                  type="submit"
                  className="primary"
                  disabled={busy}
                >
                  {busy ? 'Guardando v1…' : 'Crear Plantilla (v1)'}
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary"
                  disabled={busy}
                >
                  {busy ? 'Versionando…' : 'Guardar / Versionar Plantilla'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

