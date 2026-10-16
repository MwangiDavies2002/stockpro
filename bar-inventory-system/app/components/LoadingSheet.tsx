export default function LoadingSheet({ label = 'Loading your records' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="loading-sheet"><p className="text-sm text-gray-600">{label}</p><div aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton-line" />)}</div></div>;
}
