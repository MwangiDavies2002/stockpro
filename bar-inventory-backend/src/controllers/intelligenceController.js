const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
const { buildIntelligence } = require('../utils/ownerIntelligence');

async function overview(req, res, next) {
  try {
    const id = getBusinessId(req);
    const [products, weekly, adjustments, cash, suppliers, weekdays] = await Promise.all([
      query(`SELECT i.*, COALESCE(x.units_sold,0) units_sold, COALESCE(x.revenue,0) revenue FROM inventory_items i LEFT JOIN
        (SELECT si.item_id, SUM(si.quantity) units_sold, SUM(si.quantity*si.unit_price) revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.business_id=? AND s.created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY si.item_id) x ON x.item_id=i.id WHERE i.business_id=?`, [id,id]),
      query(`SELECT COALESCE(SUM(CASE WHEN created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN total ELSE 0 END),0) current_revenue, COALESCE(SUM(CASE WHEN created_at<DATE_SUB(NOW(),INTERVAL 7 DAY) THEN total ELSE 0 END),0) previous_revenue FROM sales WHERE business_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 14 DAY)`, [id]),
      query(`SELECT l.id,i.name,i.cost,l.after_stock-l.before_stock quantity,l.note,l.created_at FROM inventory_stock_log l JOIN inventory_items i ON i.id=l.item_id WHERE i.business_id=? AND l.change_type='adjustment' AND l.created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) ORDER BY l.created_at DESC`, [id]),
      query(`SELECT sh.id,sh.variance,sh.closing_expected,sh.closed_at FROM shifts sh JOIN users u ON u.id=sh.user_id WHERE u.business_id=? AND sh.status='closed' AND sh.closed_at>=DATE_SUB(NOW(),INTERVAL 30 DAY)`, [id]),
      query(`SELECT oi.item_id,o.supplier_id,s.name supplier_name, SUM(oi.quantity*oi.unit_price)/NULLIF(SUM(oi.quantity),0) unit_cost,COUNT(DISTINCT o.id) orders,MAX(o.created_at) latest_purchase FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN suppliers s ON s.id=o.supplier_id AND s.business_id=o.business_id WHERE o.business_id=? AND o.status='delivered' AND o.created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY) GROUP BY oi.item_id,o.supplier_id,s.name`, [id]),
      query(`SELECT DAYNAME(created_at) day,COUNT(DISTINCT DATE(created_at)) trading_days,SUM(total)/COUNT(DISTINCT DATE(created_at)) average_revenue FROM sales WHERE business_id=? AND created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY) GROUP BY DAYNAME(created_at) ORDER BY average_revenue DESC`, [id]),
    ]);
    const leadDays = Math.min(90, Math.max(1, Number(req.query.leadDays) || 3));
    const coverDays = Math.min(90, Math.max(1, Number(req.query.coverDays) || 14));
    res.json({ ...buildIntelligence(products.rows, weekly.rows[0], adjustments.rows, cash.rows, suppliers.rows, {leadDays, coverDays}), adjustments: adjustments.rows, cash: cash.rows, supplierPrices: suppliers.rows, weekdays: weekdays.rows });
  } catch (error) { next(error); }
}
module.exports = { overview };
