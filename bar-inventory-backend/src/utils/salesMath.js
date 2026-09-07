function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function calculateSalesLine(line) {
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice ?? line.unit_price);
  const discountPercent = Number(line.discountPercent ?? line.discount_percent ?? 0);
  const taxPercent = Number(line.taxPercent ?? line.tax_percent ?? 0);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) throw badRequest('Quantity must be a positive whole number');
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) throw badRequest('Unit price must be a non-negative number');
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw badRequest('Discount percent must be between 0 and 100');
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw badRequest('Tax percent must be between 0 and 100');

  const gross = round(quantity * unitPrice);
  const discountAmount = round(gross * discountPercent / 100);
  const subtotal = round(gross - discountAmount);
  const taxAmount = round(subtotal * taxPercent / 100);
  const lineTotal = round(subtotal + taxAmount);
  return { quantity, unitPrice: round(unitPrice, 4), discountPercent, taxPercent, discountAmount, subtotal, taxAmount, lineTotal };
}

function calculateTotals(lines) {
  const subtotal = round(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const discountTotal = round(lines.reduce((sum, line) => sum + line.discountAmount, 0));
  const taxTotal = round(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const total = round(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return { subtotal, discountTotal, taxTotal, total };
}

module.exports = { calculateSalesLine, calculateTotals, badRequest };
