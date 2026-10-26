'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { useAccess } from '../AccessBoundary';
import { canAct } from '../../lib/access';
import { reportsApi } from '../../lib/api';
import { dailySalesMessage, whatsappLink } from '../../lib/reportShare';

const button = 'border rounded-sm px-3 py-2 text-sm disabled:opacity-50';
const errorMessage = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    };
    return candidate.response?.data?.message || candidate.response?.data?.error || candidate.message || 'Unable to prepare daily sales report';
  }
  return 'Unable to prepare daily sales report';
};

export default function DailySalesWhatsApp() {
  const { access } = useAccess();
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const [text, setText] = useState('');
  const canExport = canAct(access, 'reports', 'export');

  async function prepareReport() {
    if (!canExport) {
      toast.error('Your role cannot export reports');
      return;
    }
    setBusy(true);
    try {
      const [report, trend, groups] = await Promise.all([
        reportsApi.stockOverview(1),
        reportsApi.getSalesTrend(1),
        reportsApi.getSaleSizeGroups(1),
      ]);
      setText(dailySalesMessage(report.data, trend.data, groups.data));
      setShare(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openWhatsApp(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!window.stockpro?.shareWhatsApp) return;
    event.preventDefault();
    try {
      await window.stockpro.shareWhatsApp(Cookies.get('token') || '', text);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <section className="bg-white border border-gray-200 rounded-sm p-5 space-y-2">
        <h2 className="text-sm font-medium">Send today&apos;s sales report on WhatsApp</h2>
        <p className="text-xs text-gray-500">
          Prepare today&apos;s totals, review the message, then choose a WhatsApp contact and tap Send.
        </p>
        <button className={`${button} bg-green-600 text-white`} disabled={!canExport || busy} onClick={prepareReport}>
          {busy ? 'Preparing report...' : 'Prepare today’s report'}
        </button>
      </section>

      <Dialog.Root open={share} onOpenChange={setShare}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed z-[60] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 w-[calc(100%_-_2rem)] max-w-2xl max-h-[92vh] overflow-auto space-y-4">
            <Dialog.Title className="text-xl font-semibold">Review today&apos;s sales report</Dialog.Title>
            <Dialog.Description className="text-sm text-gray-500">
              WhatsApp opens with this message ready. Choose who receives it and tap Send. StockPro does not send it automatically.
            </Dialog.Description>
            <textarea
              aria-label="Daily sales report message"
              className="w-full border p-3 text-sm min-h-56"
              maxLength={8000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="flex gap-3">
              <Dialog.Close className={button}>Cancel</Dialog.Close>
              <a
                aria-disabled={!text.trim()}
                className={`${button} ${!text.trim() ? 'pointer-events-none opacity-50' : ''}`}
                href={text.trim() ? whatsappLink(text) : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openWhatsApp}
              >
                Open WhatsApp
              </a>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
