import { ValidationError, type ErrorCode } from '../../shared/errors.ts';

const statusByCode: Partial<Record<ErrorCode, number>> = {
  NOT_FOUND: 404,
  READING_NOT_FOUND: 404,
  REFUEL_NOT_FOUND: 404,
  CYCLE_NOT_FOUND: 404,
  ACCOUNT_NOT_FOUND: 404,
  PERSON_NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TEMPORARY_PASSWORD_EXPIRED: 401,
  SETUP_CODE_INVALID: 401,
  FORBIDDEN: 403,
  NOT_AN_ADMINISTRATOR: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  ACCOUNT_PROTECTED: 403,
  ACCOUNT_IS_SELF: 403,
  TOO_MANY_ATTEMPTS: 429,
  SETUP_REQUIRED: 503,
  SETUP_ALREADY_DONE: 409,
  USERNAME_TAKEN: 409,
  VEHICLE_SETUP_DONE: 409,
  ACCOUNT_HAS_HISTORY: 409,
  PERSON_HAS_HISTORY: 409,
  PERSON_HAS_ACCOUNT: 409,
  UNDO_NOT_POSSIBLE: 409,
  READING_NOT_UNDOABLE: 409,
  READING_LOCKED_BY_REFUEL: 409,
  READING_IS_LAST_OF_CLOSED_CYCLE: 409,
  REFUEL_CLOSES_CYCLE: 409,
  MERGE_BOTH_HAVE_ACCOUNTS: 409,
};

// An error with a stable code that the API returns to the client.
export class AppError extends ValidationError {
  readonly status: number;

  constructor(code: ErrorCode, params?: Record<string, string | number>, status?: number) {
    super(code, params);
    this.status = status ?? statusByCode[code] ?? 400;
  }
}

export function statusFor(error: ValidationError): number {
  return error instanceof AppError ? error.status : (statusByCode[error.code] ?? 400);
}
