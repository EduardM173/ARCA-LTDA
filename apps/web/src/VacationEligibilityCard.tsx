import React from 'react';
import { useData, Notice, short } from './components';

export interface VacationPeriod {
  period: number;
  serviceYear: number;
  days: number;
  startDate: string;
  endDate?: string;
  granted?: number;
  used?: number;
  available?: number;
}

export interface VacationEligibilityData {
  isEligible: boolean;
  eligible?: boolean;
  availableDays: number;
  available?: number;
  reason: string | null;
  diasAntiguedad?: number;
  gestiones?: number;
  totalDays?: number;
  usedDays?: number;
  reservedDays?: number;
  periods?: VacationPeriod[];
  departmentId?: string;
}

export interface VacationEligibilityCardProps {
  employeeId: string;
  revision?: number;
}

export default function VacationEligibilityCard({ employeeId, revision = 0 }: VacationEligibilityCardProps) {
  const { data, loading, error } = useData(
    employeeId ? 'vacations/eligibility/' + encodeURIComponent(employeeId) : null,
    revision
  );

  if (!employeeId) {
    return null;
  }

  const eligibility = data as VacationEligibilityData | null;

  return (
    <div className="eligibility-card" data-testid="vacation-eligibility-card">
      <div className="eligibility-card-header">
        <div>
          <h3>Elegibilidad y Saldo Vacacional (HU-15)</h3>
          <p className="muted" style={{ margin: 0, fontSize: '12px' }}>
            Cómputo por gestión según ratificación institucional y antigüedad laboral.
          </p>
        </div>
        {eligibility && (
          <span
            className={`badge ${eligibility.isEligible ? 'green' : 'red'}`}
            data-testid="eligibility-badge"
          >
            {eligibility.isEligible ? 'Elegible' : 'No elegible'}
          </span>
        )}
      </div>

      <Notice error={error} loading={loading} />

      {eligibility && (
        <>
          <div className="eligibility-counter">
            <span className="count">{eligibility.availableDays}</span>
            <span className="label">
              {eligibility.availableDays === 1 ? 'día disponible' : 'días acumulados disponibles'}
            </span>
          </div>

          {!eligibility.isEligible && eligibility.reason && (
            <div className="eligibility-reason" role="status">
              <strong>Motivo de no elegibilidad:</strong> {eligibility.reason}
            </div>
          )}

          {eligibility.diasAntiguedad !== undefined && (
            <div className="eligibility-meta">
              <span>
                Antigüedad acumulada: <strong>{eligibility.diasAntiguedad} días</strong>
              </span>
              {eligibility.gestiones !== undefined && (
                <span>
                  Gestiones completadas: <strong>{eligibility.gestiones}</strong>
                </span>
              )}
              {eligibility.usedDays !== undefined && eligibility.usedDays > 0 && (
                <span>
                  Días consumidos: <strong>{eligibility.usedDays}</strong>
                </span>
              )}
            </div>
          )}

          {eligibility.periods && eligibility.periods.length > 0 && (
            <div className="eligibility-periods">
              <h4 style={{ margin: '8px 0', fontSize: '13px' }}>Detalle de periodos acumulados por gestión</h4>
              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Gestión</th>
                      <th>Periodo</th>
                      <th>Días correspondientes</th>
                      <th>Consumidos</th>
                      <th>Saldo de gestión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibility.periods.map(p => (
                      <tr key={p.period}>
                        <td>
                          <strong>Gestión {p.period}</strong>
                        </td>
                        <td>
                          {short(p.startDate)} → {p.endDate ? short(p.endDate) : '—'}
                        </td>
                        <td>{p.granted ?? p.days} días</td>
                        <td>{p.used ?? 0} días</td>
                        <td>
                          <strong>{p.available ?? p.days} días</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

