const { query } = require('../config/db');
const Journal = require('../models/Journal');
const stockReport=require('../utils/stockReport'),operationsReport=require('./operationsReportController');
async function reportingWindow(req,defaultDays=30){const{bid,business,window}=await operationsReport.context({...req,query:{...req.query,days:req.query.days??defaultDays}});const range=stockReport.range(window);return{bid,business,window,since:new Date(range.since),until:new Date(range.until)};}
async function series(req,kind,days){const w=await reportingWindow(req,days);const{rows}=await query('SELECT total,created_at FROM sales WHERE business_id=? AND created_at>=? AND created_at<?',[w.bid,w.since,w.until]);return stockReport.salesSeries(rows,w.window.timezone,kind);}
const { getBusinessId } = require('../utils/tenant');

async function getProfit(req, res, next) {
  try {
    const requestedDays=Number(req.query.days??30);if(!Number.isInteger(requestedDays)||requestedDays<1||requestedDays>3660)return res.status(400).json({message:'Days must be a whole number between 1 and 3660'});
    const {bid:businessId,window:{days},since,until}=await reportingWindow(req);
    const { rows } = await query(`
      SELECT item_id, item_name, SUM(quantity) AS units_sold,
             ROUND(SUM(revenue),2) AS net_revenue,
             ROUND(SUM(CASE WHEN unit_cost IS NOT NULL THEN quantity*unit_cost ELSE 0 END),2) AS recorded_cost,
             SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END) AS missing_cost_lines,
             CASE WHEN SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END)=0
                  THEN ROUND(SUM(revenue-quantity*unit_cost),2) ELSE NULL END AS gross_profit
      FROM (
        SELECT si.item_id, si.item_name, si.quantity, si.unit_cost,
               COALESCE(si.net_revenue,si.quantity*si.unit_price) AS revenue
        FROM sale_items si JOIN sales s ON s.id=si.sale_id
        WHERE s.business_id=? AND s.created_at >= ? AND s.created_at < ?
        UNION ALL
        SELECT ci.item_id, ci.item_name, -ci.quantity, ci.unit_cost, -ci.subtotal
        FROM sales_document_items ci JOIN sales_documents cn ON cn.id=ci.document_id
        WHERE cn.business_id=? AND cn.type='credit_note' AND cn.status='issued'
          AND cn.created_at >= ? AND cn.created_at < ?
      ) profit_events
      GROUP BY item_id,item_name ORDER BY net_revenue DESC`, [businessId, since,until,businessId,since,until]);
    const items = rows.map(row => ({ ...row, units_sold: Number(row.units_sold), net_revenue: Number(row.net_revenue), recorded_cost: Number(row.recorded_cost), missing_cost_lines: Number(row.missing_cost_lines), gross_profit: row.gross_profit === null ? null : Number(row.gross_profit) }));
    const revenue = Number(items.reduce((sum, row) => sum + row.net_revenue, 0).toFixed(2));
    const cost = Number(items.reduce((sum, row) => sum + row.recorded_cost, 0).toFixed(2));
    const missing = items.reduce((sum, row) => sum + row.missing_cost_lines, 0);
    res.json({ days, items, summary: { netRevenue: revenue, recordedCost: cost, missingCostLines: missing, grossProfit: missing ? null : Number((revenue-cost).toFixed(2)), marginPercent: missing || revenue <= 0 ? null : Number(((revenue-cost)/revenue*100).toFixed(2)) } });
  } catch (err) { next(err); }
}

/* GET /api/reports/stock */
/**
 * Report: current stock levels with a status of LOW/OK per item.
 */
async function getStock(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        i.*,
        CASE WHEN i.stock=0 THEN 'OUT' WHEN i.stock <= i.threshold THEN 'LOW' ELSE 'OK' END AS status,
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
async function getUsage(req,res,next){try{const report=await operationsReport.stockData(req);res.json(report.items.map(i=>({...i,units_sold:i.net_units_sold})).sort((a,b)=>b.units_sold-a.units_sold||b.revenue-a.revenue));}catch(e){next(e);}}

/* GET /api/reports/sale-size-groups */
/**
 * Report: sales bucketed by transaction size (Micro/Small/Medium/Large),
 * derived from the real sales table.
 */
async function getSaleSizeGroups(req,res,next){try{res.json(await series(req,'size',30));}catch(e){next(e);}}
async function getSalesTrend(req,res,next){try{res.json(await series(req,'day',14));}catch(e){next(e);}}
async function getHourlySales(req,res,next){try{res.json(await series(req,'hour',3));}catch(e){next(e);}}

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
             si.unit_price, si.unit_cost AS cost, (si.unit_cost - si.unit_price) * si.quantity AS estimated_loss
      FROM sales s JOIN sale_items si ON si.sale_id=s.id JOIN inventory_items i ON i.id=si.item_id
      WHERE s.business_id=? AND si.unit_cost IS NOT NULL AND si.unit_price < si.unit_cost AND s.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
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

module.exports = { getProfit, getStock, getUsage, getSaleSizeGroups, getSalesTrend, getHourlySales, getBenchmarks, getProductPairs, getLossAlerts, getStaffPerformance, getLedger };
