CREATE TABLE customers (
 id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, verified_at timestamptz,
 failed_logins integer NOT NULL DEFAULT 0, locked_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE customer_sessions (
 token_hash text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_sessions_customer_idx ON customer_sessions(customer_id);
CREATE TABLE customer_tokens (
 token_hash text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL,
 used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orders ADD COLUMN customer_id text REFERENCES customers(id);
CREATE INDEX orders_customer_idx ON orders(customer_id,created_at DESC);
ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK(payment_status IN ('unpaid','collected','pending','paid','review','refunded'));
ALTER TABLE order_events DROP CONSTRAINT order_events_payment_status_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_payment_status_check CHECK(payment_status IN ('unpaid','collected','pending','paid','review','refunded'));
CREATE TABLE email_outbox (
 id text PRIMARY KEY, event_key text NOT NULL UNIQUE, recipient text NOT NULL, subject text NOT NULL,
 encrypted_payload text, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','sent','preview','review','expired')),
 attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(),
 valid_until timestamptz, provider_id text, issue text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_pending_idx ON email_outbox(state,available_at);
CREATE TABLE notification_settings (id text PRIMARY KEY, enabled_at timestamptz NOT NULL DEFAULT now());
INSERT INTO notification_settings(id) VALUES('orders');
CREATE TABLE return_requests (
 id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), customer_id text REFERENCES customers(id),
 request_key text NOT NULL UNIQUE, kind text NOT NULL CHECK(kind IN ('cancel','return')),
 reason text NOT NULL, state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','approved','rejected','received','refund_pending','refunded','closed')),
 response text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 amount_paise bigint NOT NULL CHECK(amount_paise>=0), restocked boolean NOT NULL DEFAULT false,
 refund_state text NOT NULL DEFAULT 'none' CHECK(refund_state IN ('none','creating','uncertain','pending','processed','failed','manual')),
 gateway_key_id text, payment_id text, refund_id text UNIQUE, refund_issue text, manual_reference text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX return_requests_active_order_idx ON return_requests(order_id) WHERE state NOT IN ('rejected');
CREATE TABLE return_events (
 id text PRIMARY KEY, request_id text NOT NULL REFERENCES return_requests(id), user_id text REFERENCES admin_users(id),
 state text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
