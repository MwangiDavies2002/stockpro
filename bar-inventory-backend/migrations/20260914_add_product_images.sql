-- Run once on an existing StockPro database.
ALTER TABLE inventory_items ADD COLUMN image_url TEXT NULL;
