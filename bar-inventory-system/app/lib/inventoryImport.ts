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
    ...(read('brand')!==undefined?{brand:String(read('brand')).trim()}:{}),
    ...(read('barcode')!==undefined?{barcode:String(read('barcode')).trim()}:{}),
    sku: String(read('sku', 'sku (leave blank to auto generate sku)') ?? '').trim(),
    stock: Number(read('stock', 'opening stock') ?? 0),
    threshold: Number(read('threshold', 'alert quantity') ?? 5),
    cost: Number(read('cost', 'purchase price (including tax)', 'purchase price (excluding tax)') ?? 0),
    price: Number(read('price', 'selling price') ?? 0),
  };
}

// Ignore the supplied empty template example, but keep incomplete product rows for validation.
export function isInventoryTemplatePlaceholder(row: Record<string, unknown>) {
  const defaults: Record<string, string> = {
    'barcode type': 'c128', 'manage stock?': '1', 'alert quantity': '5',
    'selling price tax type': 'inclusive', 'product type': 'single', 'opening stock': '0',
    'enable product description, imei or serial number': '0', 'not for selling': '0',
  };
  return Object.entries(row).every(([key, value]) => {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || defaults[key.trim().toLowerCase().replace(/\s+/g, ' ')] === text;
  });
}
