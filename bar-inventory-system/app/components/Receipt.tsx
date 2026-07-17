'use client';

interface ReceiptItem {
  item_name: string;
  quantity: number;
  unit_price: number;
}

interface ReceiptProps {
  saleId: number | string;
  items: ReceiptItem[];
  total: number;
  paymentMethod: string;
  cashierName?: string;
  offline?: boolean;
  onClose: () => void;
}

/**
 * Printable receipt modal. Shows on screen normally, but when the
 * user clicks Print, only the #receipt-print element is sent to the
 * printer (everything else is hidden via the print media query).
 */
export default function Receipt({ saleId, items, total, paymentMethod, cashierName, offline, onClose }: ReceiptProps) {
  const now = new Date();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-print, #receipt-print * {
            visibility: visible;
          }
          #receipt-print {
            position: absolute;
            top: 0;
            left: 0;
            width: 80mm;
          }
        }
      `}</style>

      <div className="bg-white rounded-lg max-w-xs w-full p-4 print:shadow-none print:rounded-none">
        {offline && (
          <div className="mb-2 text-center text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 print:hidden">
            OFFLINE — will sync when connection returns
          </div>
        )}
        <div id="receipt-print" className="font-mono text-xs text-black">
          <div className="text-center mb-2">
            <p className="font-bold text-sm">StockPro</p>
            <p>Sale Receipt</p>
          </div>
          <div className="border-t border-dashed border-black my-2" />
          <p>Receipt #: {saleId}</p>
          <p>Date: {now.toLocaleDateString('en-KE')} {now.toLocaleTimeString('en-KE')}</p>
          {cashierName && <p>Cashier: {cashierName}</p>}
          <div className="border-t border-dashed border-black my-2" />
          {items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.quantity}x {item.item_name}</span>
              <span>{(item.quantity * item.unit_price).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-dashed border-black my-2" />
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>KSh {total.toFixed(2)}</span>
          </div>
          <p className="mt-1">Payment: {paymentMethod === 'cash' ? 'Cash' : 'M-Pesa'}</p>
          <div className="border-t border-dashed border-black my-2" />
          <p className="text-center">Thank you for your business!</p>
        </div>

        <div className="flex gap-2 mt-4 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}