'use client';

import {FormEvent, useState} from 'react';
import {useRouter} from 'next/navigation';
import {HelpCircle, MessageCircle, Search, Send, X} from 'lucide-react';
import {findHelpArticles, helpArticles, HelpArticle} from '../lib/helpContent';

type Message = {id: number; question?: string; articles?: HelpArticle[]; fallback?: boolean};

const suggestions = [
  'How do I create an invoice?',
  'How do I receive stock?',
  'How do I transfer stock?',
  'How do I create a credit note?',
];

export default function HelpAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<'ask'|'search'>('ask');

  function ask(value = question) {
    const text = value.trim();
    if (!text) return;
    const articles = findHelpArticles(text);
    setMessages(current => [...current, {id: Date.now(), question: text, articles, fallback: articles.length === 0}]);
    setQuestion('');
    setTab('ask');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask();
  }

  function goToArticle(article: HelpArticle) {
    if (article.href) {
      setOpen(false);
      router.push(article.href);
    }
  }

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open Help Center assistant"
      title="Ask the Help Center"
      className="fixed bottom-20 right-4 z-[70] inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 font-semibold text-white shadow-lg hover:opacity-90 md:bottom-6"
    >
      <MessageCircle size={20}/><span className="hidden sm:inline">Ask Help</span>
    </button>
    {open && <div className="fixed inset-0 z-[80] flex items-end justify-end bg-black/20 sm:items-end sm:p-5" onMouseDown={event => {if(event.target===event.currentTarget)setOpen(false);}}>
      <section aria-label="Help Center assistant" className="flex h-[min(680px,92vh)] w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-[min(680px,85vh)] sm:max-w-md sm:rounded-xl">
        <header className="flex items-center justify-between bg-sky-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><HelpCircle size={22}/></span><div><h2 className="font-semibold">Help Center</h2><p className="text-sm text-sky-100">Ask a how-to question</p></div></div>
          <button type="button" aria-label="Close Help Center" onClick={()=>setOpen(false)} className="rounded p-2 hover:bg-white/10"><X size={20}/></button>
        </header>
        <div className="grid grid-cols-2 border-b text-sm">
          <button type="button" onClick={()=>setTab('ask')} className={`border-b-2 px-4 py-3 font-medium ${tab==='ask'?'border-blue-600 text-blue-700':'border-transparent text-slate-600'}`}>Ask</button>
          <button type="button" onClick={()=>setTab('search')} className={`border-b-2 px-4 py-3 font-medium ${tab==='search'?'border-blue-600 text-blue-700':'border-transparent text-slate-600'}`}>Search guides</button>
        </div>
        {tab==='search' ? <div className="flex-1 overflow-y-auto p-4"><label className="mb-4 flex items-center gap-2 rounded-lg border p-2"><Search size={18} className="text-slate-500"/><input className="min-w-0 flex-1 outline-none" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();ask();}}} placeholder="Search guides"/></label><div className="space-y-2">{(question?findHelpArticles(question):helpArticles).map(article=><button key={article.id} type="button" onClick={()=>{setMessages(current=>[...current,{id:Date.now(),question:article.title,articles:[article]}]);setTab('ask');}} className="block w-full rounded-lg border p-3 text-left hover:bg-slate-50"><span className="text-xs text-slate-500">{article.category}</span><span className="mt-1 block text-sm font-medium text-slate-800">{article.title}</span></button>)}</div>{question&&!findHelpArticles(question).length&&<p className="py-4 text-sm text-slate-600">No matching guide found. Try a shorter phrase such as “invoice” or “transfer stock”.</p>}</div> : <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!messages.length && <div className="rounded-xl border border-slate-200 p-4"><p className="mb-3 text-sm leading-6 text-slate-700">Hi 👋 Ask how to use StockPro. I’ll find the steps in the Help Center.</p><div className="flex flex-wrap gap-2">{suggestions.map(item=><button key={item} type="button" onClick={()=>ask(item)} className="rounded-full border border-blue-300 px-3 py-1.5 text-left text-xs text-blue-700 hover:bg-blue-50">{item}</button>)}</div></div>}
          {messages.map(message=><div key={message.id} className="space-y-3"><div className="ml-auto max-w-[90%] rounded-xl rounded-br-sm bg-blue-50 p-3 text-sm text-slate-800">{message.question}</div><div className="max-w-[95%] space-y-3 rounded-xl rounded-bl-sm border border-slate-200 p-3 text-sm text-slate-700">{message.fallback?<><p>I couldn’t find a matching how-to guide. Try asking about invoices, quotations, receiving stock, transfers, adjustments, payments, credit notes, reports, or Treasury.</p><button type="button" className="text-blue-700 underline" onClick={()=>setTab('search')}>Browse all guides</button></>:message.articles?.map(article=><article key={article.id} className="space-y-2"><h3 className="font-semibold text-slate-900">{article.title}</h3><ol className="list-decimal space-y-1 pl-5">{article.answer.map(step=><li key={step}>{step}</li>)}</ol>{article.href&&<button type="button" onClick={()=>goToArticle(article)} className="font-medium text-blue-700 underline">{article.linkLabel||'Open page'}</button>}</article>)}</div></div>)}
        </div>}
        {tab==='ask'&&<form onSubmit={submit} className="flex gap-2 border-t p-3"><input aria-label="Ask a help question" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask how to do something..." maxLength={300}/><button disabled={!question.trim()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send size={16}/><span>Ask</span></button></form>}
        <footer className="border-t px-4 py-3 text-center text-xs text-slate-600"><button type="button" className="mb-2 block w-full text-blue-700 underline" onClick={()=>{setOpen(false);router.push('/help');}}>Open the full Help Center</button>Answers use built-in guides. No business records are shared.</footer>
      </section>
    </div>}
  </>;
}
