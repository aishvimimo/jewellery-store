CREATE TABLE orders (
 id text PRIMARY KEY, number text NOT NULL UNIQUE, checkout_key text NOT NULL UNIQUE,
 receipt_secret_hash text NOT NULL, request_hash text NOT NULL,
 mode text NOT NULL CHECK (mode IN ('test','live')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
 payment_method text NOT NULL DEFAULT 'cod' CHECK (payment_method = 'cod'),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','collected')),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 customer jsonb NOT NULL, address jsonb NOT NULL, totals jsonb NOT NULL,
 total_paise bigint NOT NULL CHECK (total_paise >= 0),
 delivery text NOT NULL CHECK (delivery IN ('standard','express')), gift_wrap boolean NOT NULL,
 tracking jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_recent_idx ON orders(created_at DESC, id);
CREATE INDEX orders_status_idx ON orders(status, mode, created_at DESC);
CREATE TABLE order_lines (
 order_id text NOT NULL REFERENCES orders(id), variant_id text NOT NULL REFERENCES product_variants(id),
 product_id text NOT NULL REFERENCES products(id), product_slug text NOT NULL, sku text NOT NULL,
 name text NOT NULL, label text NOT NULL, image text NOT NULL, quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
 unit_price_paise bigint NOT NULL CHECK (unit_price_paise > 0), line_total_paise bigint NOT NULL CHECK (line_total_paise > 0),
 PRIMARY KEY(order_id, variant_id)
);
CREATE TABLE order_events (
 id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), user_id text REFERENCES admin_users(id),
 status text NOT NULL CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
 payment_status text NOT NULL CHECK (payment_status IN ('unpaid','collected')), note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at);
ALTER TABLE inventory_movements ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE inventory_movements ADD COLUMN order_id text REFERENCES orders(id);
