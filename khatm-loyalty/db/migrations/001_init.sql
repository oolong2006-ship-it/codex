-- Khatm loyalty platform — initial schema.
-- Every tenant-owned table carries merchant_id; the data-access layer
-- (src/server/tenant.ts) scopes every query by it.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  name          text NOT NULL,
  name_en       text,
  plan          text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','basic','pro','chain')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  city          text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX branches_merchant_idx ON branches(merchant_id);

CREATE TABLE staff_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  name          text NOT NULL,
  email         text UNIQUE,
  password_hash text,
  pin_hash      text,
  role          text NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'CASHIER' OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
CREATE INDEX staff_merchant_idx ON staff_users(merchant_id);

CREATE TABLE sessions (
  token_hash    text PRIMARY KEY,
  staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('dashboard','staff')),
  branch_id     uuid REFERENCES branches(id) ON DELETE CASCADE,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(staff_user_id);

CREATE TABLE loyalty_programs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  type               text NOT NULL DEFAULT 'STAMPS' CHECK (type IN ('STAMPS')),
  name               text NOT NULL,
  stamps_required    int  NOT NULL CHECK (stamps_required BETWEEN 2 AND 30),
  reward_description text NOT NULL,
  cooldown_minutes   int  NOT NULL DEFAULT 30 CHECK (cooldown_minutes BETWEEN 0 AND 1440),
  max_stamps_per_scan int NOT NULL DEFAULT 3 CHECK (max_stamps_per_scan BETWEEN 1 AND 10),
  welcome_stamps     int  NOT NULL DEFAULT 0 CHECK (welcome_stamps BETWEEN 0 AND 5),
  design             jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms              text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX programs_merchant_idx ON loyalty_programs(merchant_id);

CREATE TABLE customers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name               text NOT NULL,
  phone              text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  consent_at         timestamptz NOT NULL,
  marketing_opt_in   boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, phone)
);

CREATE TABLE cards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id        uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  program_id         uuid NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  customer_id        uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  serial_number      text NOT NULL UNIQUE,
  -- Apple Wallet web-service auth token (also gates the public web card page).
  auth_token         text NOT NULL,
  current_stamps     int  NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
  rewards_available  int  NOT NULL DEFAULT 0 CHECK (rewards_available >= 0),
  cycles_completed   int  NOT NULL DEFAULT 0,
  total_stamps       int  NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
  last_stamp_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cards_one_active_per_program ON cards(program_id, customer_id) WHERE status = 'ACTIVE';
CREATE INDEX cards_merchant_idx ON cards(merchant_id);

-- Immutable event log. Customer deletion keeps anonymous history for analytics.
CREATE TABLE stamp_events (
  id             bigserial PRIMARY KEY,
  merchant_id    uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  card_id        uuid REFERENCES cards(id) ON DELETE SET NULL,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_user_id  uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  quantity       int  NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  source         text NOT NULL CHECK (source IN ('STAFF','POS','WELCOME')),
  device         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stamp_events_merchant_time_idx ON stamp_events(merchant_id, created_at);
CREATE INDEX stamp_events_card_idx ON stamp_events(card_id, created_at);

CREATE TABLE redemptions (
  id             bigserial PRIMARY KEY,
  merchant_id    uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  card_id        uuid REFERENCES cards(id) ON DELETE SET NULL,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_user_id  uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  reward_description text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX redemptions_merchant_time_idx ON redemptions(merchant_id, created_at);

CREATE TABLE wallet_registrations (
  device_library_id text NOT NULL,
  serial_number     text NOT NULL REFERENCES cards(serial_number) ON DELETE CASCADE,
  push_token        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_library_id, serial_number)
);

-- Transactional outbox: wallet pushes / messages are enqueued inside the same
-- transaction as the state change and drained after commit (and by the worker).
CREATE TABLE outbox_jobs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  payload       jsonb NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  run_after     timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox_jobs(run_after) WHERE done_at IS NULL;

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  merchant_id   uuid REFERENCES merchants(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity        text,
  entity_id     text,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_merchant_time_idx ON audit_log(merchant_id, created_at DESC);

CREATE TABLE rate_limits (
  key           text NOT NULL,
  window_start  timestamptz NOT NULL,
  count         int NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE pos_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('foodics','mock')),
  program_id    uuid NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  webhook_secret text NOT NULL,
  -- external branch id -> our branch id
  branch_map    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider)
);

CREATE TABLE pos_events (
  integration_id uuid NOT NULL REFERENCES pos_integrations(id) ON DELETE CASCADE,
  external_id    text NOT NULL,
  result         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, external_id)
);

CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  template_key  text NOT NULL,
  audience      text NOT NULL CHECK (audience IN ('ALL','AT_RISK','REWARD_READY')),
  message       text NOT NULL,
  recipients    int NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_log (
  id            bigserial PRIMARY KEY,
  merchant_id   uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  campaign_id   uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel       text NOT NULL,
  status        text NOT NULL,
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
