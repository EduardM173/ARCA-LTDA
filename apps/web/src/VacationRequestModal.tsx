import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { Notice } from './components';

export interface VacationPolicyLike {
  counting?: string;
  weekdays?: number[];
  holidays?: string[];
}

export interface VacationBalanceLike {
  available?: number;
  availableDays?: number;
  reserved?: number;
  reservedDays?: number;
}

export interface VacationRequestModalProps {
  employeeId: string;
  balance?: VacationBalanceLike | null;
  policy?: VacationPolicyLike | null;
  title?: string;
  onSubmitted?: () => void;
}

const INSUFFICIENT_BALANCE = 'Saldo de vacaciones insuficiente para el periodo solicitado';

export function countRequestedDays(start: string, end: string, policy?: VacationPolicyLike | null): number {
  if (!start || !end || start > end) return 0;
  const counting = policy?.counting || 'CALENDAR';
  const weekdays = policy?.weekdays ?? [1, 2, 3, 4, 5];
  const holidays = policy?.holidays ?? [];
  let total = 0;
  for (
    let day = new Date(start + 'T00:00:00Z'), last = new Date(end + 'T00:00:00Z');
    day <= last;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const iso = day.toISOString().slice(0, 10);
    if (counting === 'CALENDAR' || (weekdays.includes(day.getUTCDay()) && !holidays.includes(iso))) {
      total += 1;
    }
  }
  return total;
}

export default function VacationRequestModal({
  employeeId,
  balance,
  policy,
  title = 'Nueva solicitud de vacaciones',
  onSubmitted,
}: VacationRequestModalProps) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const available = balance?.available ?? balance?.availableDays ?? 0;
  const requestedDays = useMemo(() => countRequestedDays(start, end, policy), [start, end, policy]);
  const remainingAfter = Math.max(0, available - requestedDays);
  const exceedsBalance = requestedDays > available;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  function close() {
    setOpen(false);
    setError('');
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement)) as Record<string, string>;
    const startDate = values.start || '';
    const endDate = values.end || '';
    const requestedReason = values.reason || '';
    const days = countRequestedDays(startDate, endDate, policy);

    setStart(startDate);
    setEnd(endDate);
    setReason(requestedReason);
    setError('');

    if (!startDate || !endDate || startDate > endDate) {
      setError('Seleccione un rango de fechas válido.');
      return;
    }
    if (days < 1) {
      setError('El rango de fechas seleccionado no contiene días laborables.');
      return;
    }
    if (days > available) {
      setError(INSUFFICIENT_BALANCE);
      return;
    }

    setBusy(true);
    try {
      await api('vacations/requests', 'POST', {
        employeeId,
        start: startDate,
        end: endDate,
        reason: requestedReason || undefined,
        requestKey,
      });
      formElement.dataset.dirty = 'false';
      form.current?.reset();
      setStart('');
      setEnd('');
      setReason('');
      setRequestKey(crypto.randomUUID());
      setOpen(false);
      onSubmitted?.();
    } catch (caught) {
      const failure = caught as ApiError;
      setError(failure.status === 422 ? failure.message : failure.message || 'No fue posible registrar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setError(''); setOpen(true); }}>
        {title}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="form-dialog vacation-request-dialog"
          aria-labelledby="vacation-request-title"
          onCancel={event => { event.preventDefault(); close(); }}
        >
          <div className="toolbar">
            <h2 id="vacation-request-title">Solicitud de vacaciones</h2>
            <button type="button" onClick={close} aria-label="Cerrar diálogo">Cerrar ×</button>
          </div>
          <form
            ref={form}
            className="form"
            data-testid="vacation-request-form"
            onInput={event => { event.currentTarget.dataset.dirty = 'true'; }}
            onSubmit={submit}
          >
            <h3>{title}</h3>
            <div className="fields">
              <label>
                Inicio
                <input name="start" type="date" required onChange={event => setStart(event.target.value)} />
              </label>
              <label>
                Fin
                <input name="end" type="date" required onChange={event => setEnd(event.target.value)} />
              </label>
            </div>

            <div className="vacation-request-balance" data-testid="vacation-balance-preview">
              <p>Saldo actual<strong>{available} días</strong></p>
              <p>Días solicitados<strong>{requestedDays} días</strong></p>
              <p>Saldo restante<strong>{remainingAfter} días</strong></p>
            </div>

            {exceedsBalance && (
              <p className="vacation-request-warning" role="alert">
                {INSUFFICIENT_BALANCE}
              </p>
            )}

            <label>
              Justificación o motivo (opcional)
              <textarea name="reason" value={reason} onChange={event => setReason(event.target.value)} />
            </label>

            <Notice error={error} />
            <p className="muted">
              El saldo y los solapamientos se validan al guardar. El aviso por correo no sustituye la aprobación.
            </p>
            <button className="primary" disabled={busy || exceedsBalance}>
              {busy ? 'Guardando…' : 'Presentar solicitud'}
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
