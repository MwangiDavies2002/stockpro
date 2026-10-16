import {Suspense} from 'react';
import SalesARClient from './SalesARClient';

export function generateStaticParams() {
  return [
    { type: 'quotation' },
    { type: 'sales_order' },
    { type: 'proforma' },
    { type: 'invoice' },
    { type: 'credit_note' },
  ];
}

export default function SalesARPage() {
  return <Suspense fallback={<p>Loading sales documents...</p>}><SalesARClient /></Suspense>;
}
