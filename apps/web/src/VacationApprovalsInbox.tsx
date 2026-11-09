import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError, Row } from './api';
import { Badge, Notice, short } from './components';

export interface VacationApprovalsInboxProps {
  user: { id: string; roles: string[]; permissions?: string[] };
  employees: Row[];
  revision: number;
  onDecided: () => void;
}

export default function VacationApprovalsInbox({
  user,
  employees,
  revision,
  onDecided,
}: VacationApprovalsInboxProps) {
  const [localDecisions, setLocalDecisions] = useState<Record<string, { status: string; reason?: string }>>({});
  const [targetRequest, setTargetRequest] = useState<Row | null>(null);
  const [dialogMode, setDialogMode] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const rejectDialogRef = useRef<HTMLDialogElement>(null);

  const has = (...roles: string[]) => user.roles.some(r => roles.includes(r));
  const canApprove = has('ADMIN', 'HR') || (has('APPROVER') && user.permissions?.includes('vacations.approve'));

  // Consulta exclusiva de solicitudes en estado PENDIENTE para la bandeja
  const pendingQuery = useDataPending(revision);

  useEffect(() => {
    if (dialogMode === 'APPROVE') {
      approveDialogRef.current?.showModal();
    } else {
      approveDialogRef.current?.close();
    }

    if (dialogMode === 'REJECT') {
      rejectDialogRef.current?.showModal();
    } else {
      rejectDialogRef.current?.close();
    }
  }, [dialogMode]);

  function getEmployeeName(employeeId: string): string {
    const found = employees.find(e => e.id === employeeId);
    if (!found) return 'Funcionario (' + employeeId.slice(0, 8) + ')';
    return `${found.code ? found.code + ' · ' : ''}${found.name || 'Sin nombre'}`;
  }

  function openApprove(req: Row) {
    setTargetRequest(req);
    setValidationError('');
    setDialogMode('APPROVE');
  }

  function openReject(req: Row) {
    setTargetRequest(req);
    setRejectionReason('');
    setValidationError('');
    setDialogMode('REJECT');
  }

  function closeModal() {
    setDialogMode(null);
    setTargetRequest(null);
    setRejectionReason('');
    setValidationError('');
  }

  async function handleApprove() {
    if (!targetRequest) return;
    setBusy(true);
    setValidationError('');
    try {
      await api(`vacations/requests/${targetRequest.id}/decision`, 'PATCH', {
        decision: 'APROBADA',
      });
      // Actualización visual en tiempo real
      setLocalDecisions(prev => ({
        ...prev,
        [targetRequest.id]: { status: 'APROBADA' },
      }));
      setNotice({
        type: 'success',
        message: `Solicitud de ${getEmployeeName(targetRequest.employeeId)} aprobada exitosamente.`,
      });
      closeModal();
      onDecided();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setValidationError(msg || 'No fue posible completar la aprobación.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!targetRequest) return;
    const trimmed = rejectionReason.trim();
    if (!trimmed) {
      setValidationError('El motivo de rechazo es obligatorio');
      return;
    }
    setBusy(true);
    setValidationError('');
    try {
      await api(`vacations/requests/${targetRequest.id}/decision`, 'PATCH', {
        decision: 'RECHAZADA',
        rejectionReason: trimmed,
      });
      // Actualización visual en tiempo real
      setLocalDecisions(prev => ({
        ...prev,
        [targetRequest.id]: { status: 'RECHAZADA', reason: trimmed },
      }));
      setNotice({
        type: 'success',
        message: `Solicitud de ${getEmployeeName(targetRequest.employeeId)} rechazada exitosamente.`,
      });
      closeModal();
      onDecided();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setValidationError(msg || 'No fue posible rechazar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  // Filtrar o transformar según decisiones locales en memoria
  const serverItems: Row[] = pendingQuery.data?.items || [];
  const displayItems = serverItems.map(item => {
    if (localDecisions[item.id]) {
      return { ...item, ...localDecisions[item.id] };
    }
    return item;
  });

  const pendingList = displayItems.filter(item => item.status === 'PENDIENTE');

  return (
    <section className="card vacation-approvals-inbox">
      <div className="toolbar">
        <div>
          <div className="inbox-badge-row">
            <span className="eyebrow">CONTROL DE SALDO Y CONCURRENCIA (HU-17)</span>
            {pendingList.length > 0 && (
              <span className="badge yellow">{pendingList.length} pendiente{pendingList.length === 1 ? '' : 's'}</span>
            )}
          </div>
          <h3>Bandeja de Aprobaciones de Vacaciones</h3>
          <p className="muted">
            Revise y autorice solicitudes con verificación atómica de saldo disponible.
          </p>
        </div>
      </div>

      <Notice {...pendingQuery} />

      {notice && (
        <div
          className={`notice ${notice.type === 'error' ? 'error' : 'success'}`}
          role="status"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>{notice.message}</span>
          <button className="text" style={{ padding: 0 }} onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {!pendingQuery.loading && pendingList.length === 0 && (
        <p className="empty" style={{ padding: '24px 0' }}>
          No hay solicitudes de vacaciones pendientes de aprobación en este momento.
        </p>
      )}

      <div className="approvals-list">
        {pendingList.map(req => {
          const isOwnRequest = req.createdBy === user.id;
          return (
            <div key={req.id} className="record approval-item">
              <div className="approval-info">
                <strong>{getEmployeeName(req.employeeId)}</strong>
                <p>
                  <span>Periodo: <b>{short(req.startsAt)}</b> → <b>{short(req.endsAt)}</b></span>
                  {' · '}
                  <span>Días solicitados: <b>{req.days}</b></span>
                </p>
                {req.reason && (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: '11px' }}>
                    Motivo: <em>"{req.reason}"</em>
                  </p>
                )}
                {isOwnRequest && (
                  <small style={{ color: '#92400e', display: 'block', marginTop: '4px' }}>
                    ⚠️ No puede decidir su propia solicitud.
                  </small>
                )}
              </div>

              <div className="actions">
                <Badge value={req.status} />
                <button
                  className="primary"
                  disabled={!canApprove || isOwnRequest || busy}
                  onClick={() => openApprove(req)}
                  title={isOwnRequest ? 'No puede decidir su propia solicitud' : 'Aprobar solicitud'}
                >
                  Aprobar
                </button>
                <button
                  className="button button-reject"
                  disabled={!canApprove || isOwnRequest || busy}
                  onClick={() => openReject(req)}
                  title={isOwnRequest ? 'No puede decidir su propia solicitud' : 'Rechazar solicitud'}
                >
                  Rechazar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: Confirmación de Aprobación */}
      <dialog
        ref={approveDialogRef}
        className="form-dialog vacation-decision-dialog"
        onCancel={e => {
          e.preventDefault();
          if (!busy) closeModal();
        }}
      >
        <div className="toolbar">
          <h2>Confirmar aprobación de vacaciones</h2>
          <button type="button" onClick={closeModal} disabled={busy} aria-label="Cerrar">
            Cerrar ×
          </button>
        </div>

        {targetRequest && (
          <div className="decision-dialog-content">
            <p>
              ¿Está seguro de que desea <strong>aprobar</strong> la solicitud de vacaciones de{' '}
              <strong>{getEmployeeName(targetRequest.employeeId)}</strong>?
            </p>

            <div className="details" style={{ margin: '14px 0' }}>
              <p>
                Periodo solicitado
                <strong>{short(targetRequest.startsAt)} → {short(targetRequest.endsAt)}</strong>
              </p>
              <p>
                Días a descontar
                <strong>{targetRequest.days} días</strong>
              </p>
            </div>

            <p className="muted" style={{ fontSize: '12px', background: '#f6faf6', padding: '10px', borderRadius: '6px' }}>
              ℹ️ Al confirmar, la transacción atómica re-verificará el saldo del funcionario y generará el
              débito correspondiente en el libro de movimientos. Si el saldo disponible es insuficiente, la operación será rechazada (HTTP 422).
            </p>

            {validationError && (
              <div className="notice error" role="alert">
                {validationError}
              </div>
            )}

            <div className="actions" style={{ marginTop: '18px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeModal} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={handleApprove}
              >
                {busy ? 'Aprobando…' : 'Confirmar Aprobación'}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* MODAL 2: Diálogo de Rechazo con Motivo Obligatorio */}
      <dialog
        ref={rejectDialogRef}
        className="form-dialog vacation-decision-dialog"
        onCancel={e => {
          e.preventDefault();
          if (!busy) closeModal();
        }}
      >
        <div className="toolbar">
          <h2>Rechazar solicitud de vacaciones</h2>
          <button type="button" onClick={closeModal} disabled={busy} aria-label="Cerrar">
            Cerrar ×
          </button>
        </div>

        {targetRequest && (
          <div className="decision-dialog-content">
            <p>
              Está a punto de rechazar la solicitud de{' '}
              <strong>{getEmployeeName(targetRequest.employeeId)}</strong> ({short(targetRequest.startsAt)} → {short(targetRequest.endsAt)}, {targetRequest.days} días).
            </p>

            <div style={{ margin: '16px 0' }}>
              <label htmlFor="hu17-rejection-reason" style={{ fontWeight: 600 }}>
                Motivo del rechazo <span style={{ color: '#b91c1c' }}>* (obligatorio)</span>
              </label>
              <textarea
                id="hu17-rejection-reason"
                rows={4}
                value={rejectionReason}
                placeholder="Especifique detalladamente el motivo institucional del rechazo..."
                onChange={e => {
                  setRejectionReason(e.target.value);
                  if (validationError && e.target.value.trim()) setValidationError('');
                }}
                disabled={busy}
                style={{ marginTop: '6px' }}
              />
              <small className="muted" style={{ display: 'block', marginTop: '4px' }}>
                Este motivo quedará registrado en el historial de la solicitud y no afectará el saldo de días del funcionario.
              </small>
            </div>

            {validationError && (
              <div className="notice error" role="alert">
                {validationError}
              </div>
            )}

            <div className="actions" style={{ marginTop: '18px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeModal} disabled={busy}>
                Cancelar
              </button>
              <button
                type="button"
                className="button button-reject-confirm"
                disabled={busy || !rejectionReason.trim()}
                onClick={handleReject}
              >
                {busy ? 'Rechazando…' : 'Confirmar Rechazo'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

function useDataPending(revision: number) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    api('vacations/requests?status=PENDIENTE')
      .then(res => {
        if (live) setData(res);
      })
      .catch(e => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [revision]);

  return { data, error, loading };
}

