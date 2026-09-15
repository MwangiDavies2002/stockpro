import ReferenceDataClient from './ReferenceDataClient';

export function generateStaticParams() {
  return [{ type: 'units' }, { type: 'categories' }, { type: 'brands' }];
}

export default function SetupReferencePage() {
  return <ReferenceDataClient />;
}
