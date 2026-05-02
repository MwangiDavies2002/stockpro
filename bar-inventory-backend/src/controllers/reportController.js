const { query } = require('../config/db');

/* GET /api/reports/stock */
async function getStock(req, res, next) {
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
async function getUsage(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    // Aggregate M-Pesa payments by item over the period
    const { rows } = await query(`
      SELECT
        i.id, i.name, i.category, i.price,
        i.stock, i.threshold,
        COALESCE(SUM(mp.amount), 0)::numeric AS total_revenue,
        COUNT(mp.id)::int                     AS transaction_count,
        i.sold
      FROM inventory_items i
      LEFT JOIN mpesa_payments mp
        ON mp.item_id = i.id
        AND mp.created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY i.id
      ORDER BY total_revenue DESC
    `, [days]);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/mpesa-groups */
async function getMpesaGroups(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        price_group,
        COUNT(*)::int              AS count,
        SUM(amount)::numeric       AS total,
        AVG(amount)::numeric       AS avg_amount,
        MIN(created_at)            AS earliest,
        MAX(created_at)            AS latest
      FROM mpesa_payments
      GROUP BY price_group
      ORDER BY total DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/sales-trend?days=14 */
async function getSalesTrend(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 14;
    const { rows } = await query(`
      SELECT
        DATE(created_at)          AS date,
        SUM(amount)::numeric      AS revenue,
        COUNT(*)::int             AS transactions
      FROM mpesa_payments
      WHERE created_at >= NOW() - ($1 || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [days]);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getStock, getUsage, getMpesaGroups, getSalesTrend };
