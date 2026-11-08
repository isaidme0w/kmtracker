export const activityTypes = [
  'auth.login',
  'auth.login_failed',
  'auth.login_blocked',
  'auth.password_changed',
  'setup.completed',
  'vehicle.setup',
  'reading.created',
  'reading.undone',
  'refuel.created',
  'cycle.settled',
  'account.created',
  'account.updated',
  'account.password_reset',
  'account.deactivated',
  'account.activated',
  'account.deleted',
  'person.created',
  'person.updated',
  'person.merged',
  'person.deactivated',
  'person.activated',
  'person.deleted',
  'correction.reading_updated',
  'correction.reading_inserted',
  'correction.reading_deleted',
  'correction.refuel_updated',
  'correction.refuel_added',
  'correction.refuel_deleted',
  'correction.start_odometer',
  'correction.settlement_undone',
  'settings.updated',
] as const;

export type ActivityType = (typeof activityTypes)[number];

export const activityCategories = ['login', 'reading', 'refuel', 'settlement', 'correction', 'people', 'settings'] as const;
export type ActivityCategory = (typeof activityCategories)[number];

const categoryPrefixes: Record<ActivityCategory, string[]> = {
  login: ['auth.'],
  reading: ['reading.'],
  refuel: ['refuel.'],
  settlement: ['cycle.', 'vehicle.'],
  correction: ['correction.'],
  people: ['account.', 'person.'],
  settings: ['settings.', 'setup.'],
};

export function categoryPrefixesOf(category: ActivityCategory): string[] {
  return categoryPrefixes[category];
}

export function categoryOf(type: ActivityType): ActivityCategory {
  for (const category of activityCategories) {
    if (categoryPrefixes[category].some((prefix) => type.startsWith(prefix))) return category;
  }
  return 'settings';
}

// A value before or after a change. Field names tell the frontend how to
// format it: odometer in km, amount in grosze, recordedAt as a date.
export type ChangeValue = string | number | boolean | string[] | null;
export type Changes = Record<string, { from: ChangeValue; to: ChangeValue }>;

// Values describing an event. Names are stored as text at the time of the
// event, so entries stay readable after people are renamed or deleted.
export interface ActivityData {
  part?: 'client' | 'admin';
  username?: string;
  name?: string;
  role?: string;
  odometer?: number;
  km?: number;
  participants?: string[];
  amount?: number;
  isFull?: boolean;
  paidBy?: string;
  cost?: number;
  transfers?: number;
  cycleNumber?: number;
  recordedAt?: string;
  from?: ChangeValue;
  to?: ChangeValue;
  into?: string;
  timeZone?: string;
  changes?: Changes;
}

export interface ActivityEntry {
  id: number;
  occurredAt: string;
  type: ActivityType;
  actorName: string | null;
  cycleNumber: number | null;
  data: ActivityData;
}
