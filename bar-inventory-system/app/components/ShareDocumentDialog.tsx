'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import { whatsappDocumentLink, whatsappNumber } from '../lib/documentShare';

export default function ShareDocumentDialog({ recipient, initialPhone, message, documentLabel, context }: { recipient: string; initialPhone?: string; message: string; documentLabel: string; context: 'sales' | 'purchases' }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(initialPhone || '');
  const normalized = whatsappNumber(phone);

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button type="button" className="border px-3 py-2">Forward {documentLabel} on WhatsApp</button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[80]" />
      <Dialog.Content className="fixed z-[90] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border p-6 w-[calc(100%_-_2rem)] max-w-md space-y-4">
        <Dialog.Title className="text-lg font-semibold">Forward {documentLabel}</Dialog.Title>
        <Dialog.Description className="text-sm text-gray-600">Enter {recipient}'s WhatsApp number. WhatsApp will open with the document details ready; review the message and tap Send there.</Dialog.Description>
        <label className="block text-sm">{recipient} phone number
          <input autoFocus type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678 or +254 712 345 678" className="block w-full border px-3 py-2 mt-1" value={phone} onChange={event => setPhone(event.target.value)} />
        </label>
        <p className="text-xs text-gray-500">The message includes the document summary and line items. It does not attach a PDF.</p>
        <div className="flex justify-end gap-3">
          <Dialog.Close className="border px-4 py-2 text-sm">Cancel</Dialog.Close>
          <a
            href={normalized ? whatsappDocumentLink(phone, message) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!normalized}
            onClick={async event => {
              if (!normalized) { event.preventDefault(); toast.error('Enter a valid phone number with country code'); return; }
              if (window.stockpro?.shareWhatsAppDocument) {
                event.preventDefault();
                try { await window.stockpro.shareWhatsAppDocument(Cookies.get('token') || '', normalized, message, context); setOpen(false); }
                catch (error: any) { toast.error(error.message || 'Could not open WhatsApp'); }
              } else setOpen(false);
            }}
            className={`px-4 py-2 text-sm ${normalized ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'}`}
          >Open WhatsApp</a>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
