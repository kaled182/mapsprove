-- mapsprove/database/migrations/2025-setup-settings.sql

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value_enc   BYTEA NOT NULL,
  nonce       BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS settings_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT NOT NULL,
  action      TEXT NOT NULL,            -- created|updated|revealed
  actor       TEXT,                     -- user/email/id
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  details     JSONB                     -- {old?: masked, new?: masked}
);

-- Indexes úteis
CREATE INDEX IF NOT EXISTS idx_settings_audit_key ON settings_audit_log(key);
CREATE INDEX IF NOT EXISTS idx_settings_audit_at  ON settings_audit_log(at);
