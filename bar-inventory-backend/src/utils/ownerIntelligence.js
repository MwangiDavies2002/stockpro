const num = value => Number(value) || 0;
const clamp = value => Math.max(0, Math.min(100, value));

function buildIntelligence(products, weekly, adjustments, cash, suppliers, settings = {}) {
  const leadDays = num(settings.leadDays) || 3;
  const coverDays = num(settings.coverDays) || 14;
  const recommendations = products.map(product => {
    const velocity = num(product.units_sold) / 30;
    const daysLeft = velocity > 0 ? num(product.stock) / velocity : null;
    const quantity = Math.max(0, Math.ceil(Math.max(num(product.threshold), velocity * (leadDays + coverDays)) - num(product.stock)));
    const offers = suppliers.filter(s => s.item_id === product.id).sort((a, b) => num(a.unit_cost) - num(b.unit_cost));
    const cost = offers.length ? num(offers[0].unit_cost) : num(product.cost);
    return { ...product, velocity, daysLeft, quantity, orderInDays: daysLeft === null ? null : Math.max(0, Math.floor(daysLeft - leadDays)), estimatedRevenue: quantity * num(product.price), estimatedGrossProfit: quantity * (num(product.price) - cost), supplier: offers[0] || null };
  }).filter(p => p.quantity > 0).sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const revenue = products.reduce((s, p) => s + num(p.revenue), 0);
  const cost = products.reduce((s, p) => s + num(p.units_sold) * num(p.cost), 0);
  const margin = revenue > 0 ? (revenue - cost) / revenue : null;
  const negativeAdjustments = adjustments.reduce((s, r) => s + Math.max(0, -num(r.quantity)) * num(r.cost), 0);
  const stockValue = products.reduce((s, p) => s + num(p.stock) * num(p.cost), 0);
  const shortage = cash.reduce((s, r) => s + Math.max(0, -num(r.variance)), 0);
  const components = {
    availability: products.length ? 100 * products.filter(p => num(p.stock) > 0).length / products.length : null,
    velocity: products.length && revenue > 0 ? 100 * products.filter(p => num(p.units_sold) > 0).length / products.length : null,
    margin: margin === null ? null : clamp(margin / 0.3 * 100),
    adjustments: stockValue > 0 ? clamp(100 - negativeAdjustments / stockValue * 100) : null,
    cash: cash.length ? clamp(100 - shortage / Math.max(1, cash.reduce((s, r) => s + num(r.closing_expected), 0)) * 100) : null,
    reorderReadiness: products.length ? 100 * products.filter(p => p.supplier_id).length / products.length : null,
  };
  const available = Object.values(components).filter(v => v !== null);
  const current = num(weekly.current_revenue), previous = num(weekly.previous_revenue);
  return { generatedAt: new Date().toISOString(), windowDays: 30, assumptions: { leadDays, coverDays, marginTarget: 0.3 }, components, score: available.length ? Math.round(available.reduce((a, b) => a + b, 0) / available.length) : null,
    recommendations, slowStockValue: products.filter(p => num(p.units_sold) < 3).reduce((s, p) => s + num(p.stock) * num(p.cost), 0),
    margin, negativeAdjustments, cashShortage: shortage, weekly: { revenue: current, previousRevenue: previous, changePercent: previous > 0 ? (current - previous) / previous * 100 : null },
    limitations: ['Gross profit uses current product cost, not historical cost.', 'Stock adjustments are review signals, not proof of wastage or theft.', 'Revenue and profit on reorder quantities assume all suggested units sell at the current price.', 'Missing score components are excluded, not treated as perfect.', 'Lead time is a planning assumption; supplier delivery promises are not yet recorded.'] };
}
module.exports = { buildIntelligence };
