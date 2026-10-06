ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod','online'));
ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('unpaid','collected','pending','paid','review'));
ALTER TABLE order_events DROP CONSTRAINT order_events_payment_status_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_payment_status_check CHECK (payment_status IN ('unpaid','collected','pending','paid','review'));
ALTER TABLE orders ADD COLUMN payment_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN inventory_released boolean NOT NULL DEFAULT false;
UPDATE orders SET inventory_released=true WHERE status='cancelled';
CREATE TABLE payment_sessions (
 order_id text PRIMARY KEY REFERENCES orders(id), key_id text NOT NULL,
 gateway_order_id text UNIQUE, payment_id text UNIQUE,
 state text NOT NULL CHECK (state IN ('creating','ready','uncertain')),
 issue text, last_checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_webhook_events (
 id text PRIMARY KEY, body_hash text NOT NULL, event_type text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_payment_pending_idx ON orders(payment_status,payment_expires_at) WHERE payment_method='online';
