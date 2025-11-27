import React, { useEffect, useState } from 'react';
import Button from './Button';

type Message = { role: 'user' | 'assistant' | 'system'; text: string };

const ConversationPanel: React.FC<{ context?: any, scope?: string }> = ({ context, scope }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sql, setSql] = useState('');
  const [providers, setProviders] = useState<Array<any>>([]);
  const [selectedProvider, setSelectedProvider] = useState<'auto' | string>('auto');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

    const sendMessage = async () => {
    if (!input) return;
    const m: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, m]);
    setInput('');
    // Ask backend LLM to generate SQL (if endpoint exists)
    try {
      const body: any = { prompt: input, context, scope, messages };
      if (selectedProvider && selectedProvider !== 'auto') body.providerId = selectedProvider;
      const res = await fetch('/api/llm/generate_sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const j = await res.json();
        // Prefer the explanatory text (what the LLM understood and will do), then set the SQL editor to the returned SQL
        let assistantText = j.text || j.explanation || (j.sql ? `Action to Be Taken:\n${j.sql}` : 'No SQL generated.');
        if (j.providerUsed) assistantText = `(Provider: ${j.providerUsed})\n\n` + assistantText;
        setMessages(prev => [...prev, { role: 'assistant', text: assistantText }]);
        setSql(j.sql || '');
      } else {
        const txt = await res.text();
        setMessages(prev => [...prev, { role: 'assistant', text: 'LLM endpoint error: ' + txt }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'assistant', text: 'LLM service unreachable. Generated SQL can be entered manually.' }]);
    }
  };

  useEffect(() => {
    // try to fetch available providers (public endpoint may be disabled in production)
    (async () => {
      try {
        const res = await fetch('/api/llm_providers');
        if (!res.ok) return;
        const j = await res.json();
        if (Array.isArray(j)) setProviders(j);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const runSql = async () => {
    if (!sql) { alert('Please provide SQL to run.'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/execute_sql', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, scope })
      });
      if (res.ok) {
        const j = await res.json();
        setResult(j);
      } else {
        setResult({ error: await res.text() });
      }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white border p-3 rounded shadow-sm">
        <h3 className="font-semibold">Conversation / Query Assistant</h3>
        <p className="text-xs text-gray-500">Ask questions about this data. The assistant can suggest SQL and you can run it below.</p>

        <div className="mt-3 space-y-2 max-h-48 overflow-auto p-2 bg-gray-50 rounded">
          {messages.length === 0 && <div className="text-xs text-gray-400">No messages yet. Ask a question or request a SQL query.</div>}
          {messages.map((m, i) => (
            <div key={i} className={`p-2 rounded ${m.role === 'user' ? 'text-right' : 'bg-white'}`}>
              <div className={`inline-block text-sm ${m.role === 'user' ? 'bg-primary-600 text-white px-2 py-1 rounded' : 'text-gray-800'}`}>{m.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2 items-center">
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value as any)} className="p-2 border rounded text-sm">
            <option value="auto">Automatic</option>
            {providers.map(p => <option key={p.id} value={String(p.id)}>{p.name || p.provider_id}</option>)}
          </select>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask e.g. Show average score by facility" className="flex-1 p-2 border rounded" />
          <Button onClick={sendMessage} disabled={!input}>Ask</Button>
        </div>

        <div className="mt-3">
          <label className="block text-sm font-medium">SQL (editable)</label>
          <textarea value={sql} onChange={e => setSql(e.target.value)} rows={6} className="mt-1 block w-full p-2 border rounded font-mono text-sm" />
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={runSql} disabled={running}>{running ? 'Running...' : 'Run SQL'}</Button>
            <Button variant="secondary" onClick={() => { setSql(''); setResult(null); }}>Clear</Button>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-sm font-medium">Result</label>
          <div className="mt-1 p-2 border rounded bg-white min-h-[6rem] max-h-96 overflow-auto">
            {result === null && <div className="text-xs text-gray-400">No result yet.</div>}
            {result && result.error && <div className="text-sm text-red-600">Error: {String(result.error)}</div>}
            {result && !result.error && Array.isArray(result.rows) && (
              <div className="overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50"><tr>{Object.keys(result.rows[0] || {}).map(k => <th key={k} className="px-2 py-1 text-left">{k}</th>)}</tr></thead>
                  <tbody>{result.rows.map((r: any, ri: number) => (<tr key={ri}>{Object.keys(result.rows[0] || {}).map((k) => <td key={k} className="px-2 py-1">{String(r[k] ?? '')}</td>)}</tr>))}</tbody>
                </table>
              </div>
            )}
            {result && !result.error && !Array.isArray(result.rows) && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationPanel;
