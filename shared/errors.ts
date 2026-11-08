// Stable error codes returned by the API and by validation helpers. The
// frontends translate them; the server never sends user-facing texts.
export const errorCodes = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'SETUP_REQUIRED',
  'SETUP_ALREADY_DONE',
  'SETUP_CODE_INVALID',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'INVALID_CREDENTIALS',
  'TOO_MANY_ATTEMPTS',
  'TEMPORARY_PASSWORD_EXPIRED',
  'NOT_AN_ADMINISTRATOR',
  'CURRENT_PASSWORD_INVALID',
  'PASSWORD_UNCHANGED',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_TOO_LONG',
  'USERNAME_INVALID',
  'USERNAME_TAKEN',
  'NAME_REQUIRED',
  'NAME_TOO_LONG',
  'LAST_NAME_REQUIRED',
  'TIME_ZONE_INVALID',
  'ODOMETER_INVALID',
  'ODOMETER_TOO_LOW',
  'ODOMETER_OUT_OF_RANGE',
  'AMOUNT_INVALID',
  'DATE_INVALID',
  'DATE_OUT_OF_ORDER',
  'PARTICIPANTS_REQUIRED',
  'PERSON_NOT_FOUND',
  'PERSON_INACTIVE',
  'VEHICLE_SETUP_REQUIRED',
  'VEHICLE_SETUP_DONE',
  'READING_NOT_FOUND',
  'READING_NOT_UNDOABLE',
  'READING_LOCKED_BY_REFUEL',
  'READING_IS_LAST_OF_CLOSED_CYCLE',
  'REFUEL_NOT_FOUND',
  'REFUEL_CLOSES_CYCLE',
  'CYCLE_NOT_FOUND',
  'UNDO_NOT_POSSIBLE',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_PROTECTED',
  'ACCOUNT_IS_SELF',
  'ACCOUNT_HAS_HISTORY',
  'PERSON_HAS_ACCOUNT',
  'PERSON_HAS_HISTORY',
  'MERGE_BOTH_HAVE_ACCOUNTS',
  'MERGE_SAME_PERSON',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export interface ApiError {
  code: ErrorCode;
  params?: Record<string, string | number>;
}

export class ValidationError extends Error {
  readonly code: ErrorCode;
  readonly params?: Record<string, string | number>;

  constructor(code: ErrorCode, params?: Record<string, string | number>) {
    super(code);
    this.code = code;
    this.params = params;
  }
}
