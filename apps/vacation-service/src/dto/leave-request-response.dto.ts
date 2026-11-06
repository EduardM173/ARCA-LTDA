export interface CreateVacationRequestInput {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  requestKey?: string;
  createdBy?: string;
}

export interface LeaveRequestResponseDto {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  reason: string | null;
  status: string;
  createdAt: Date;
  days?: number;
  startsAt?: Date | string;
  endsAt?: Date | string;
  createdBy?: string;
  departmentId?: string | null;
  requestKey?: string | null;
  policyId?: string;
}

export const INSUFFICIENT_VACATION_BALANCE = 'Saldo de vacaciones insuficiente para el periodo solicitado';
export const OVERLAPPING_VACATION_REQUEST = 'El funcionario ya cuenta con una solicitud o periodo de vacaciones registrado en las fechas seleccionadas';

function isoDay(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

export function toLeaveRequestResponse(record: any, fallback?: { startDate?: string; endDate?: string; daysRequested?: number }): LeaveRequestResponseDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    startDate: fallback?.startDate || isoDay(record.startsAt ?? record.startDate),
    endDate: fallback?.endDate || isoDay(record.endsAt ?? record.endDate),
    daysRequested: record.days ?? record.daysRequested ?? fallback?.daysRequested ?? 0,
    reason: record.reason ?? null,
    status: record.status ?? 'PENDIENTE',
    createdAt: record.createdAt ?? new Date(),
    days: record.days,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    createdBy: record.createdBy,
    departmentId: record.departmentId ?? null,
    requestKey: record.requestKey ?? null,
    policyId: record.policyId,
  };
}
