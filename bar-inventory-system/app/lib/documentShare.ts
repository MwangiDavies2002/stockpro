const clean = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const money = (value: unknown) => Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const salesDocumentNumber = (id: unknown) => `INV-${String(id).padStart(6, '0')}`;

export function whatsappNumber(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

export const whatsappDocumentLink = (phone: string, message: string) =>
  `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`;

export function salesInvoiceMessage(doc: any) {
  const customer = doc.customer?.name || doc.customer_name || 'Customer';
  const lines = [
    `${clean(doc.seller?.name || 'Business')} - Sales invoice ${salesDocumentNumber(doc.id)}`,
    ...(doc.reference_no ? [`Customer reference: ${clean(doc.reference_no)}`] : []),
    `To: ${clean(customer)}`,
    `Date: ${String(doc.document_date || '').slice(0, 10)}`,
    ...(doc.due_date ? [`Due: ${String(doc.due_date).slice(0, 10)}`] : []),
    '',
    ...(doc.items || []).slice(0, 40).map((item: any) => `${clean(item.item_name)} x ${item.quantity}: ${doc.seller?.currency || 'KES'} ${money(item.line_total)}`),
    ...((doc.items || []).length > 40 ? [`Plus ${(doc.items || []).length - 40} more line items.`] : []),
    '',
    `Subtotal: ${doc.seller?.currency || 'KES'} ${money(doc.subtotal)}`,
    `Tax: ${doc.seller?.currency || 'KES'} ${money(doc.tax_total)}`,
    `Invoice total: ${doc.seller?.currency || 'KES'} ${money(doc.total)}`,
    `Paid: ${doc.seller?.currency || 'KES'} ${money(doc.paid_amount)}`,
    `Balance due: ${doc.seller?.currency || 'KES'} ${money(doc.balance_due)}`,
  ];
  return lines.join('\n');
}

export function purchaseInvoiceMessage(purchase: any) {
  const currency = 'KES';
  const lines = [
    `${clean(purchase.supplier?.name || purchase.supplier_name || 'Supplier')} - Purchase receipt ${clean(purchase.reference_no || `#${purchase.id}`)}`,
    `Date: ${String(purchase.purchase_date || purchase.created_at || '').slice(0, 10)}`,
    `Location: ${clean(purchase.location_name || '-')}`,
    '',
    ...(purchase.items || []).slice(0, 40).map((item: any) => `${clean(item.item_name)} x ${item.quantity}: ${currency} ${money(item.net_cost ?? item.subtotal)}`),
    ...((purchase.items || []).length > 40 ? [`Plus ${(purchase.items || []).length - 40} more line items.`] : []),
    '',
    `Purchase total: ${currency} ${money(purchase.total)}`,
    `Paid: ${currency} ${money(purchase.paid_amount)}`,
    `Balance due: ${currency} ${money(purchase.balance_due)}`,
  ];
  return lines.join('\n');
}
