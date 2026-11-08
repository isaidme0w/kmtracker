CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE persons (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL UNIQUE REFERENCES persons(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_is_temporary INTEGER NOT NULL DEFAULT 0,
  temporary_password_expires_at TEXT,
  role TEXT NOT NULL CHECK (role IN ('driver', 'admin')),
  active INTEGER NOT NULL DEFAULT 1,
  is_protected INTEGER NOT NULL DEFAULT 0,
  accent TEXT NOT NULL DEFAULT 'blue',
  language TEXT NOT NULL DEFAULT 'pl',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('client', 'admin')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_account ON sessions(account_id);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX login_attempts_username ON login_attempts(username, attempted_at);

CREATE TABLE cycles (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  start_odometer INTEGER NOT NULL,
  end_odometer INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  closed INTEGER NOT NULL DEFAULT 0,
  cost INTEGER,
  total_km REAL
);
-- Exactly one cycle can be active at a time.
CREATE UNIQUE INDEX cycles_one_active ON cycles(closed) WHERE closed = 0;

CREATE TABLE readings (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  odometer INTEGER NOT NULL,
  recorded_by INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (cycle_id, odometer)
);

CREATE TABLE reading_participants (
  reading_id INTEGER NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  PRIMARY KEY (reading_id, person_id)
);
CREATE INDEX reading_participants_person ON reading_participants(person_id);

CREATE TABLE refuels (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_by INTEGER NOT NULL REFERENCES persons(id),
  odometer INTEGER NOT NULL,
  is_full INTEGER NOT NULL,
  closes_cycle INTEGER NOT NULL DEFAULT 0,
  recorded_by INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX refuels_cycle ON refuels(cycle_id);
CREATE INDEX refuels_paid_by ON refuels(paid_by);

CREATE TABLE cycle_shares (
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id),
  km REAL NOT NULL,
  percent REAL NOT NULL,
  share INTEGER NOT NULL,
  paid INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  PRIMARY KEY (cycle_id, person_id)
);
CREATE INDEX cycle_shares_person ON cycle_shares(person_id);

CREATE TABLE cycle_transfers (
  id INTEGER PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  from_person INTEGER NOT NULL REFERENCES persons(id),
  to_person INTEGER NOT NULL REFERENCES persons(id),
  amount INTEGER NOT NULL
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  actor_name TEXT,
  subject_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL,
  data TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX activity_log_occurred ON activity_log(occurred_at);
CREATE INDEX activity_log_cycle ON activity_log(cycle_id, type);

CREATE TABLE correction_seen (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  last_seen_log_id INTEGER NOT NULL,
  PRIMARY KEY (account_id, cycle_id)
);
