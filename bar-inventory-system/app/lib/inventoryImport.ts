// Spreadsheet headings are data: accept case and spacing differences between templates.
export function mapInventoryImportRow(row: Record<string, unknown>) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.trim().toLowerCase().replace(/\s+/g, ' '), value,
  ]));
  const read = (...keys: string[]) => keys.map(key => normalized[key])
    .find(value => value !== undefined && value !== null && String(value).trim() !== '');
  return {
    name: String(read('name', 'product name') ?? '').trim(),
    category: String(read('category') ?? '').trim(),
    unit: String(read('unit') ?? 'Pieces').trim(),
    sku: String(read('sku', 'sku (leave blank to auto generate sku)') ?? '').trim(),
    stock: Number(read('stock', 'opening stock') ?? 0),
    threshold: Number(read('threshold', 'alert quantity') ?? 5),
    cost: Number(read('cost', 'purchase price (including tax)', 'purchase price (excluding tax)') ?? 0),
    price: Number(read('price', 'selling price') ?? 0),
  };
}
