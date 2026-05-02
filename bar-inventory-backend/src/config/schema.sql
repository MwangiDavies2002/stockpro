-- BarStock Pro – PostgreSQL Schema
-- Run: psql -U postgres -d bar_inventory -f schema.sql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100)        NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  password   VARCHAR(255)        NOT NULL,
  role       VARCHAR(20)         NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  phone      VARCHAR(20),
  active     BOOLEAN             NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(150)        NOT NULL,
  email          VARCHAR(150),
  phone          VARCHAR(20),
  address        TEXT,
  items_supplied TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory items
CREATE TABLE IF NOT EXISTS inventory_items (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150)  NOT NULL,
  category    VARCHAR(50)   NOT NULL,
  unit        VARCHAR(30)   NOT NULL DEFAULT 'Bottles',
  stock       INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
  threshold   INTEGER       NOT NULL DEFAULT 5,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  sold        INTEGER       NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','delivered','cancelled')),
  notes       TEXT,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id    INTEGER       REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name  VARCHAR(150)  NOT NULL,
  quantity   INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL
);

-- M-Pesa payments
CREATE TABLE IF NOT EXISTS mpesa_payments (
  id               SERIAL PRIMARY KEY,
  transaction_id   VARCHAR(50) UNIQUE NOT NULL,
  phone            VARCHAR(20)        NOT NULL,
  amount           NUMERIC(10,2)      NOT NULL,
  item_id          INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name        VARCHAR(150),
  price_group      VARCHAR(20)        NOT NULL,
  mpesa_receipt    VARCHAR(50),
  status           VARCHAR(20)        NOT NULL DEFAULT 'completed',
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_category  ON inventory_items(category);
CREATE INDEX IF NOT EXISTS idx_inventory_stock      ON inventory_items(stock);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_created_at     ON mpesa_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_mpesa_price_group    ON mpesa_payments(price_group);

-- Seed sample data
INSERT INTO suppliers (name, email, phone) VALUES
  ('EABL Kenya',     'orders@eabl.co.ke',      '0800720720'),
  ('Diageo Kenya',   'supply@diageo.co.ke',    '0800723888'),
  ('Beverage World', 'info@beverageworld.co.ke','0711223344'),
  ('Wine World KE',  'orders@wineworld.co.ke', '0733445566')
ON CONFLICT DO NOTHING;

INSERT INTO inventory_items (name, category, unit, stock, threshold, price, sold) VALUES
  ('Tusker Lager',         'Beers',     'Bottles', 48, 20,  200,  234),
  ('White Cap',            'Beers',     'Bottles', 8,  15,  180,  189),
  ('Johnnie Walker Black', 'Spirits',   'Bottles', 5,  10, 2200,   42),
  ('Gilbeys Gin',          'Spirits',   'Bottles', 22, 8,   950,   78),
  ('KWV Pinotage',         'Wines',     'Bottles', 11, 6,   750,   33),
  ('Soda Water',           'Mixers',    'Bottles', 3,  12,   50,  310),
  ('Lime Wedges',          'Garnishes', 'Pieces',  40, 30,    5,  450),
  ('Konyagi',              'Spirits',   'Bottles', 30, 10,  650,  115),
  ('Pilsner Urquell',      'Beers',     'Bottles', 25, 10,  220,   97),
  ('Red Bull',             'Mixers',    'Bottles', 7,  15,  350,  180)
ON CONFLICT DO NOTHING;
