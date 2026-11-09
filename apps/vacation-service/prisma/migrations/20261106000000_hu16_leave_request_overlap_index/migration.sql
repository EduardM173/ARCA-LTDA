-- HU-16: acelera la validación de solapamientos por funcionario, estado y rango de fechas.
CREATE INDEX "LeaveRequest_employeeId_status_startsAt_endsAt_idx"
ON "LeaveRequest"("employeeId", "status", "startsAt", "endsAt");
