CREATE TABLE products (
  id text PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL,
  description text NOT NULL, active boolean NOT NULL DEFAULT true,
  featured_rank integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (slug text PRIMARY KEY, name text NOT NULL);
CREATE TABLE product_categories (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_slug text NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_slug)
);
CREATE TABLE product_variants (
  id text PRIMARY KEY, product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE, label text NOT NULL,
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  compare_at_paise integer CHECK (compare_at_paise IS NULL OR compare_at_paise >= price_paise),
  colour text NOT NULL, material text NOT NULL, gender text NOT NULL
);
CREATE TABLE inventory (
  variant_id text PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_images (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0), url text NOT NULL,
  PRIMARY KEY (product_id, position)
);
CREATE INDEX variants_product_idx ON product_variants(product_id);
CREATE INDEX variants_filters_idx ON product_variants(colour, material, gender, price_paise);
CREATE INDEX product_categories_slug_idx ON product_categories(category_slug, product_id);
CREATE INDEX products_active_rank_idx ON products(active, featured_rank, id);
