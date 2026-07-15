const { query } = require('../config/db');

/* GET /api/reports/stock */
/**
 * Report: current stock levels with a status of LOW/OK per item.
 */
async function getStock(_req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        i.*,
        CASE WHEN i.stock <= i.threshold THEN 'LOW' ELSE 'OK' END AS status,
        s.name AS supplier_name
      FROM inventory_items i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      ORDER BY i.stock ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/usage?days=30 */
/**
 * Report: units sold and revenue per item over a time window (days),
 * derived from real sale_items/sales rows.
 */
async function getUsage(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await query(
      `SELECT
         i.id, i.name, i.category, i.price, i.stock, i.threshold,
         COALESCE(u.qty, 0)     AS units_sold,
         COALESCE(u.revenue, 0) AS revenue
       FROM inventory_items i
       LEFT JOIN (
         SELECT si.item_id,
                SUM(si.quantity)               AS qty,
                SUM(si.quantity * si.unit_price) AS revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= DATE_SUB(NOW(), INTERVAL $1 DAY)
         GROUP BY si.item_id
       ) u ON u.item_id = i.id
       ORDER BY revenue DESC`,
      [days]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/sale-size-groups */
/**
 * Report: sales bucketed by transaction size (Micro/Small/Medium/Large),
 * derived from the real sales table.
 */
async function getSaleSizeGroups(_req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        CASE
          WHEN total <= 50   THEN 'Micro'
          WHEN total <= 500  THEN 'Small'
          WHEN total <= 1000 THEN 'Medium'
          ELSE 'Large'
        END AS price_group,
        COUNT(*)     AS count,
        SUM(total)   AS total,
        AVG(total)   AS avg_amount
      FROM sales
      GROUP BY price_group
    `);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/sales-trend?days=14 */
/**
 * Report: daily revenue and transaction count for the given period,
 * derived from the real sales table.
 */
async function getSalesTrend(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 14;
    const { rows } = await query(
      `SELECT
         DATE(created_at) AS date,
         SUM(total)       AS revenue,
         COUNT(*)         AS transactions
       FROM sales
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL $1 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getStock, getUsage, getSaleSizeGroups, getSalesTrend };