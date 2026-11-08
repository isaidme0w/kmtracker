// Shapes of the data exchanged between the server and the frontends.
import type { ActivityEntry, ActivityCategory } from './activity.ts';
import type { ApiError } from './errors.ts';
import type { Accent, Language } from './preferences.ts';

export type { ActivityEntry, ActivityCategory, ApiError };

export type Role = 'driver' | 'admin';

export interface PersonRef {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
}

export interface ReadingDto {
  id: number;
  odometer: number;
  km: number;
  recordedAt: string;
  recordedBy: string | null;
  participants: PersonRef[];
  canUndo: boolean;
}

export interface RefuelDto {
  id: number;
  amount: number;
  paidBy: PersonRef;
  odometer: number;
  isFull: boolean;
  closesCycle: boolean;
  recordedAt: string;
}

export interface PersonShareDto {
  person: PersonRef;
  km: number;
  percent: number;
  // In the active cycle: the estimate, or null without history.
  share: number | null;
  paid: number;
  balance: number | null;
}

export interface TransferDto {
  from: PersonRef;
  to: PersonRef;
  amount: number;
}

export interface CycleSummaryDto {
  id: number;
  number: number;
  startOdometer: number;
  endOdometer: number | null;
  startedAt: string;
  endedAt: string | null;
  closed: boolean;
  cost: number | null;
  totalKm: number | null;
  corrected: boolean;
}

export interface CycleCostDto {
  cost: number;
  km: number;
}

export interface ActiveCycleDto {
  cycle: CycleSummaryDto;
  lastOdometer: number;
  lastReadingAt: string | null;
  totalKm: number;
  refuelsTotal: number;
  refuels: RefuelDto[];
  people: PersonShareDto[];
  rate: CycleCostDto | null;
  readings: ReadingDto[];
  corrections: ActivityEntry[];
  correctionsUnseen: boolean;
}

export interface CycleDetailsDto {
  cycle: CycleSummaryDto;
  position: { index: number; total: number };
  refuels: RefuelDto[];
  people: PersonShareDto[];
  transfers: TransferDto[];
  readings: ReadingDto[];
  corrections: ActivityEntry[];
  correctionsUnseen: boolean;
}

export interface SettlementPreviewDto {
  willClose: boolean;
  newReadingKm: number;
  cost: number;
  totalKm: number;
  people: PersonShareDto[];
  transfers: TransferDto[];
}

export interface RefuelResultDto {
  settled: boolean;
  cycle: CycleDetailsDto | null;
}

export interface MeDto {
  account: {
    id: number;
    username: string;
    role: Role;
    createdAt: string;
    mustChangePassword: boolean;
    accent: Accent;
    language: Language;
    isProtected: boolean;
  };
  person: PersonRef;
  timeZone: string;
  vehicleSetupDone: boolean;
  unseenCorrections: { active: boolean; history: boolean };
}

export interface StatusDto {
  setupRequired: boolean;
  version: string;
}

export interface VehicleDto {
  setupDone: boolean;
  lastOdometer: number | null;
}

export interface SelectablePersonDto extends PersonRef {
  selectable: boolean;
}

// Administrator panel

export type AccountStatus = 'active' | 'temporary' | 'expired' | 'deactivated';

export interface AdminAccountDto {
  id: number;
  person: PersonRef;
  username: string;
  role: Role;
  status: AccountStatus;
  temporaryPasswordExpiresAt: string | null;
  isProtected: boolean;
  isSelf: boolean;
  hasHistory: boolean;
  createdAt: string;
}

export interface AdminPersonDto {
  person: PersonRef;
  hasAccount: boolean;
  accountActive: boolean | null;
  active: boolean;
  hasHistory: boolean;
}

export interface TemporaryPasswordDto {
  username: string;
  temporaryPassword: string;
  expiresAt: string;
}

export interface AdminCycleListItemDto extends CycleSummaryDto {
  readingsCount: number;
}

export interface AdminCycleDetailsDto extends CycleDetailsDto {
  canUndoSettlement: boolean;
  isLatestClosed: boolean;
  previousCycleEnd: number | null;
}

export interface OverviewDto {
  activeCycle: {
    number: number;
    startedAt: string;
    totalKm: number;
    refuelsTotal: number;
    readingsCount: number;
    peopleCount: number;
    lastReadingAt: string | null;
  } | null;
  warnings: { type: 'temporary_password_expiring' | 'temporary_password_expired'; username: string; expiresAt: string }[];
  recent: ActivityEntry[];
}

export interface ActivityPageDto {
  entries: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppSettingsDto {
  timeZone: string;
}
