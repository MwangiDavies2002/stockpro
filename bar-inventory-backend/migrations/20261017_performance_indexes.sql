-- Performance optimizations for sales documents and reference data
ALTER TABLE `sales_documents` ADD INDEX `idx_sales_docs_perf` (`business_id`, `type`, `location_id`, `created_at` DESC);
ALTER TABLE `units` ADD INDEX `idx_units_business_location` (`business_id`, `location_id`);
ALTER TABLE `categories` ADD INDEX `idx_categories_business_location` (`business_id`, `location_id`);
ALTER TABLE `brands` ADD INDEX `idx_brands_business_location` (`business_id`, `location_id`);
