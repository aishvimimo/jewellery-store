ALTER TABLE products ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE product_variants ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX variants_sku_case_insensitive_idx ON product_variants(upper(sku));
CREATE TABLE admin_users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
  password_hash text NOT NULL, role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  active boolean NOT NULL DEFAULT true, failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_sessions_user_idx ON admin_sessions(user_id);
CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at);
CREATE TABLE admin_audit_logs (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES admin_users(id),
  action text NOT NULL, entity_id text NOT NULL, details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_recent_idx ON admin_audit_logs(created_at DESC);
CREATE TABLE inventory_movements (
  id text PRIMARY KEY, variant_id text NOT NULL REFERENCES product_variants(id),
  user_id text NOT NULL REFERENCES admin_users(id), before_quantity integer NOT NULL,
  after_quantity integer NOT NULL CHECK (after_quantity >= 0), reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
