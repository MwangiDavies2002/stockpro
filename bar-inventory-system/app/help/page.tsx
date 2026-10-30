'use client';

import {useMemo, useState} from 'react';
import {Search} from 'lucide-react';
import Navbar from '../components/Navbar';
import {findHelpArticles, helpArticles} from '../lib/helpContent';

const popular=['create a quotation','receive stock','pay a supplier','create a credit note','transfer stock'];

export default function HelpPage() {
  const [query,setQuery]=useState('');
  const results=useMemo(()=>query?findHelpArticles(query):helpArticles,[query]);
  return <><Navbar/><main className="min-h-screen bg-stone-50 p-4 lg:p-8">
    <section className="mx-auto max-w-7xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid lg:grid-cols-2">
        <div className="bg-sky-950 p-8 text-white lg:p-12"><p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-200">StockPro Help Center</p><h1 className="mt-3 text-3xl font-bold lg:text-4xl">What can we help you with?</h1><p className="mt-3 max-w-xl text-sky-100">Simple guides for everyday tasks. Search for an answer or ask the Help Center assistant.</p><label className="mt-6 flex items-center gap-3 rounded-xl bg-white p-2 text-slate-900"><Search className="ml-2 shrink-0 text-slate-500"/><input className="min-w-0 flex-1 px-1 py-2 outline-none" aria-label="Search help guides" placeholder="Search, e.g. receive stock or create an invoice" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="mt-4 flex flex-wrap gap-2"><span className="text-sm text-sky-100">Popular:</span>{popular.map(item=><button key={item} type="button" onClick={()=>setQuery(item)} className="rounded-full bg-white/15 px-3 py-1 text-xs text-white hover:bg-white/25">{item}</button>)}</div></div>
        <div className="flex min-h-64 items-center justify-center bg-gradient-to-br from-sky-100 to-indigo-100 p-8"><div className="max-w-sm text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl shadow">💬</div><h2 className="mt-4 text-2xl font-semibold text-slate-900">Ask a question</h2><p className="mt-2 text-slate-600">Get step-by-step answers for invoices, stock, transfers, payments and more.</p><button type="button" onClick={()=>document.querySelector<HTMLButtonElement>('[aria-label="Open Help Center assistant"]')?.click()} className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white">Ask the assistant</button></div></div>
      </div>
    </section>
    <section className="mx-auto mt-7 max-w-7xl"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-900">{query?'Search results':'Browse help guides'}</h2><p className="mt-1 text-sm text-slate-600">{results.length} {results.length===1?'guide':'guides'}</p></div></div>{results.length?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.map(article=><article key={article.id} className="rounded-xl border border-slate-200 bg-white p-5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{article.category}</span><h3 className="mt-3 font-semibold text-slate-900">{article.title}</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-5 text-slate-600">{article.answer.map(step=><li key={step}>{step}</li>)}</ol></article>)}</div>:<div className="rounded-xl border bg-white p-8 text-center text-slate-600">No guide matched that search. Try another phrase or ask the assistant.</div>}</section>
  </main></>;
}
