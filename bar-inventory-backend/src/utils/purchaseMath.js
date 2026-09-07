const round = (value, digits = 2) => Number(value.toFixed(digits));
function calculateLine(line) {
  const quantity = Number(line.quantity);
  const before = Number(line.costBeforeDiscount);
  const discount = Number(line.discountPercent ?? 0);
  const tax = Number(line.taxPercent ?? 0);
  let margin = Number(line.profitMargin ?? 0);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000000 ||
      ![before, discount, tax, margin].every(Number.isFinite) || before < 0 || before > 10000000 ||
      discount < 0 || discount > 100 || tax < 0 || tax > 100 || margin < -100 || margin > 100000) {
    throw Object.assign(new Error('Invalid purchase quantity, cost, discount, tax, or margin'), { status: 400 });
  }
  const unitPrice = round(before * (1 - discount / 100), 4);
  const subtotal = round(quantity * unitPrice);
  const netCost = round(subtotal + round(subtotal * tax / 100));
  const taxedUnit = unitPrice * (1 + tax / 100);
  const sellingPrice = line.sellingPrice === undefined ? round(taxedUnit * (1 + margin / 100)) : round(Number(line.sellingPrice));
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) throw Object.assign(new Error('Invalid selling price'), { status: 400 });
  if (line.sellingPrice !== undefined) margin = taxedUnit > 0 ? (sellingPrice / taxedUnit - 1) * 100 : 0;
  if (sellingPrice > 99999999.99 || margin > 100000) throw Object.assign(new Error('Selling price or margin is too large'), { status: 400 });
  return { quantity, before, discount, tax, margin, unitPrice, subtotal, netCost, sellingPrice };
}
module.exports = { calculateLine };
