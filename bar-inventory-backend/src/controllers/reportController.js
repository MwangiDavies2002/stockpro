const { query } = require('../config/db');
const Journal = require('../models/Journal');
const { getBusinessId } = require('../utils/tenant');

/* GET /api/reports/stock */
/**
 * Report: current stock levels with a status of LOW/OK per item.
 */
async function getStock(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        i.*,
        CASE WHEN i.stock <= i.threshold THEN 'LOW' ELSE 'OK' END AS status,
        s.name AS supplier_name
      FROM inventory_items i
      LEFT JOIN suppliers s ON s.id = i.supplier_id AND s.business_id = i.business_id
      WHERE i.business_id = ?
      ORDER BY i.stock ASC
    `, [getBusinessId(req)]);
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
         WHERE s.business_id = ? AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY si.item_id
       ) u ON u.item_id = i.id
       WHERE i.business_id = ?
       ORDER BY revenue DESC`,
      [getBusinessId(req), days, getBusinessId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/reports/sale-size-groups */
/**
 * Report: sales bucketed by transaction size (Micro/Small/Medium/Large),
 * derived from the real sales table.
 */
async function getSaleSizeGroups(req, res, next) {
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
      WHERE business_id = ?
      GROUP BY price_group
    `, [getBusinessId(req)]);
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
       WHERE business_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [getBusinessId(req), days]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getHourlySales(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 3;
    const { rows } = await query(`
      SELECT HOUR(created_at) AS hour, SUM(total) AS revenue, COUNT(*) AS transactions
      FROM sales
      WHERE business_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY HOUR(created_at) ORDER BY hour ASC`, [getBusinessId(req), days]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getBenchmarks(req, res, next) {
  try {
    const businessId = getBusinessId(req);
    const [own, network] = await Promise.all([
      query(`SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS transactions FROM sales WHERE business_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`, [businessId]),
      query(`SELECT COALESCE(AVG(revenue),0) AS avg_revenue, COALESCE(AVG(transactions),0) AS avg_transactions, COUNT(*) AS businesses FROM (SELECT business_id, SUM(total) AS revenue, COUNT(*) AS transactions FROM sales WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY business_id) x`, []),
    ]);
    res.json({ own: own.rows[0], network: network.rows[0], optedIn: true });
  } catch (err) { next(err); }
}

async function getProductPairs(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT a.item_name AS product_a, b.item_name AS product_b, COUNT(*) AS times_bought_together
      FROM sale_items a JOIN sale_items b ON a.sale_id=b.sale_id AND a.item_id < b.item_id
      JOIN sales s ON s.id=a.sale_id
      WHERE s.business_id=? AND s.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
      GROUP BY a.item_id, b.item_id, a.item_name, b.item_name
      ORDER BY times_bought_together DESC LIMIT 8`, [getBusinessId(req)]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function getLossAlerts(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT s.id AS sale_id, s.created_at, s.payment_method, si.item_name, si.quantity,
             si.unit_price, i.cost, (i.cost - si.unit_price) * si.quantity AS estimated_loss
      FROM sales s JOIN sale_items si ON si.sale_id=s.id JOIN inventory_items i ON i.id=si.item_id
      WHERE s.business_id=? AND si.unit_price < i.cost AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY estimated_loss DESC LIMIT 20`, [getBusinessId(req)]);
    res.json(rows);
  } catch (err) { next(err); }
}
async function getStaffPerformance(req, res, next) {
  try { const { rows } = await query(`SELECT u.id,u.name,u.email,COUNT(s.id) AS transactions,COALESCE(SUM(s.total),0) AS revenue,COALESCE(AVG(s.total),0) AS average_sale FROM users u LEFT JOIN sales s ON s.created_by=u.id AND s.business_id=? AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE u.business_id=? GROUP BY u.id,u.name,u.email ORDER BY revenue DESC`, [getBusinessId(req), getBusinessId(req)]); res.json(rows); } catch (err) { next(err); }
}

async function getLedger(_req, res, next) {
  try {
    const { rows } = await Journal.findAll();
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { getStock, getUsage, getSaleSizeGroups, getSalesTrend, getHourlySales, getBenchmarks, getProductPairs, getLossAlerts, getStaffPerformance, getLedger };
