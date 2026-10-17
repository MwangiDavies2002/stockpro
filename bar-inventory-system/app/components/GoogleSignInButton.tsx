'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, string>) => void } } };
  }
}

export default function GoogleSignInButton({ onCredential, disabled = false }: { onCredential: (credential: string) => void; disabled?: boolean }) {
  const target = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [loaded, setLoaded] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => { callback.current = onCredential; }, [onCredential]);
  useEffect(() => {
    if (!loaded || !clientId || !target.current || !window.google) return;
    target.current.replaceChildren();
    window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => callback.current(credential) });
    window.google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: '360' });
  }, [clientId, loaded]);

  if (!clientId || (typeof window !== 'undefined' && window.stockpro)) return null;
  return <>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setLoaded(true)} />
    <div ref={target} aria-disabled={disabled} className={disabled ? 'pointer-events-none opacity-60' : ''} />
  </>;
}
