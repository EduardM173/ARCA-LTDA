export class VacationPeriodDto {
  period!: number;
  serviceYear!: number;
  days!: number;
  startDate!: string;
  endDate?: string;
  granted!: number;
  used!: number;
  available!: number;
}

export class VacationEligibilityResponseDto {
  isEligible!: boolean;
  eligible!: boolean;
  availableDays!: number;
  available!: number;
  reason!: string | null;
  diasAntiguedad!: number;
  gestiones!: number;
  totalDays!: number;
  usedDays!: number;
  reservedDays!: number;
  periods!: VacationPeriodDto[];
  buckets?: any[];
  policy?: any;
  employeeVersion?: number;
  departmentId?: string;
  tenureKey?: string;
}

