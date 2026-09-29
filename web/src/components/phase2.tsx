'use client';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Sparkles, CalendarDays, Send, Clock } from 'lucide-react';
import type { Task } from '@/lib/model';
import { localRecommendations, type Recommendations } from '@/lib/priority-v2';
import { generateLocalPlan, type Plan, type PlannerInput } from '@/lib/planner';
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/datetime';
import { apiConfigured, apiRequest, ApiError } from '@/lib/api';
type Props = {
    tasks: Task[];
    userId: string | undefined;
};
type AIResult = {
    mode: 'ai' | 'deterministic' | 'unavailable';
    message: string;
    notice: string | null;
    task_ids: string[];
};
function useRecommendations({ tasks, userId }: Props) {
    const [result, setResult] = useState<Recommendations | null>(null), [loading, setLoading] = useState(false), [notice, setNotice] = useState('');
    useEffect(() => { setResult(null); setNotice(''); if (!userId)
        return; const local = localRecommendations(tasks); if (!apiConfigured) {
        setResult(local);
        setNotice('On-device ranking · AI backend not connected.');
        return;
    } const controller = new AbortController(); setLoading(true); apiRequest<Recommendations>('/api/v1/recommendations', undefined, controller.signal).then(r => { if (!controller.signal.aborted)
        setResult(r); }).catch(e => { if (controller.signal.aborted)
        return; setNotice(e.message); if (e.status !== 401 && e.status !== 403) {
        setResult(local);
        setNotice(e.message + ' Showing on-device ranking from your loaded tasks.');
    } }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [tasks, userId]);
    return { result, loading, notice };
}
export function RecommendationCard(props: Props) {
    const { result, loading, notice } = useRecommendations(props);
    const [ai, setAI] = useState<AIResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const top = result?.top_tasks[0];
    const revision = useRef(0);
    useEffect(() => { revision.current++; setAI(null); setError(''); }, [props.tasks, props.userId]);
    async function explain() { if (!top || !props.userId)
        return; const requestedRevision = revision.current; setBusy(true); setError(''); try {
        const answer = await apiRequest<AIResult>('/api/v1/recommendations/explain', { task_id: top.task_id });
        if (requestedRevision === revision.current)
            setAI(answer);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="ai-panel phase2-panel"><div className="p2-title"><Sparkles size={21}/><h2>Recommended next</h2><span className="subtle-chip">V2</span></div>{loading ? <p role="status">Finding your next step…</p> : !props.userId ? <p>Sign in to see your recommendations.</p> : top ? <><h3>{top.title}</h3><div className="p2-score">{top.priority_score}<small> / 100 · deterministic</small></div><p>{top.reason}</p><p>{top.remaining_minutes} minutes remaining · {top.progress}% complete</p><details><summary>How this score is calculated</summary><dl className="p2-breakdown">{Object.entries(top.components).map(([name, value]) => <div key={name}><dt>{name.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></details><button className="button secondary" disabled={!apiConfigured || !result?.ai_available || busy} onClick={explain}>{busy ? 'Explaining…' : 'Ask AI to explain'}</button>{!result?.ai_available && <small>AI explanation is currently unavailable. Ranking still works.</small>}{ai && <div className="p2-answer"><strong>{ai.mode === 'ai' ? 'AI-assisted explanation' : 'Deterministic explanation'}</strong><p>{ai.message}</p>{ai.notice && <small>{ai.notice}</small>}</div>}</> : <p>{result?.summary || 'Recommendations are unavailable. Please retry after signing in.'}</p>}{notice && <small role="status">{notice}</small>}{result?.context_truncated && <p className="danger-text">This overview includes a limited set of active tasks; totals are partial.</p>}{error && <p role="alert" className="form-error">{error}</p>}</section>;
}
export function PlannerPage({ tasks, userId }: Props) {
    const [plan, setPlan] = useState<Plan | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    useEffect(() => { setPlan(null); setNotice(''); }, [tasks, userId]);
    async function generate(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (!userId)
        return; setBusy(true); setError(''); setNotice(''); setPlan(null); const f = new FormData(e.currentTarget); try {
        const input: PlannerInput = { starts_at: fromDatetimeLocal(String(f.get('starts_at')))!, ends_at: fromDatetimeLocal(String(f.get('ends_at')))!, focus_minutes: Number(f.get('focus_minutes')), break_minutes: Number(f.get('break_minutes')) };
        const local = generateLocalPlan(tasks, input);
        if (apiConfigured) {
            try {
                setPlan(await apiRequest<Plan>('/api/v1/planner/generate', input));
            }
            catch (e) {
                if (e instanceof ApiError && [0, 500, 503].includes(e.status)) {
                    setPlan(local);
                    setNotice('Backend unavailable. Generated on-device from your loaded tasks.');
                }
                else
                    throw e;
            }
        }
        else {
            setPlan(local);
            setNotice('Generated on-device from your tasks. The backend is not connected yet.');
        }
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const time = (v: string) => new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return <><div className="page-heading"><div><div className="eyebrow">MAKE ROOM FOR FOCUSED WORK</div><h1>Daily Planner</h1><p>A realistic plan, built from your priorities and remaining workload.</p></div><span className="subtle-chip">DETERMINISTIC · V2</span></div><section className="panel p2-form-panel"><form onSubmit={generate}><fieldset disabled={busy || !userId}><div className="form-grid"><label>Available start time<input name="starts_at" type="datetime-local" required defaultValue={toDatetimeLocal(new Date(Math.ceil(Date.now() / 900000) * 900000).toISOString())}/></label><label>Available end time<input name="ends_at" type="datetime-local" required/></label><label>Focus interval (minutes)<input name="focus_minutes" type="number" min={15} max={120} defaultValue={50} required/></label><label>Break length (minutes)<input name="break_minutes" type="number" min={0} max={30} defaultValue={10} required/></label></div><button className="button primary"><CalendarDays size={17}/>{busy ? 'Planning…' : 'Generate plan'}</button></fieldset></form><p className="p2-hint">Times use your browser timezone. Preview only: this does not change tasks or save calendar events.</p></section>{error && <div className="alert error" role="alert">{error}</div>}{notice && <p className="p2-notice" role="status">{notice}</p>}{plan && <section className="panel p2-plan"><div className="panel-heading"><h2>Your study window</h2><span>{plan.available_minutes} minutes available</span></div><div className="p2-summary"><span><b>{plan.scheduled_minutes}</b> scheduled</span><span><b>{plan.break_minutes}</b> breaks</span><span><b>{plan.remaining_workload_minutes}</b> workload left</span><span><b>{plan.unused_minutes}</b> unused</span></div>{plan.context_truncated && <p className="form-error">Only a limited set of active tasks is included. These totals are partial.</p>}{plan.blocks.length ? plan.blocks.map((block, i) => <div className={'p2-block ' + (block.kind === 'break' ? 'p2-break' : '')} key={i}><Clock size={17}/><span>{time(block.starts_at)}–{time(block.ends_at)}</span><div><strong>{block.title}</strong><small>{block.minutes} minutes{block.past_deadline ? ' · Finishes after its deadline' : ''}</small></div></div>) : <p className="p2-notice">No active tasks to schedule.</p>}{plan.unscheduled_tasks.length > 0 && <div className="p2-unscheduled"><h3>Work that still needs time</h3>{plan.unscheduled_tasks.map(t => <p key={t.task_id}>{t.title} — {t.remaining_minutes} minutes left{t.reason === 'PARTIALLY_SCHEDULED' ? ' (partially scheduled)' : ''}</p>)}</div>}</section>}</>;
}
export function deterministicReply(message: string, result: Recommendations): AIResult {
    const m = message.toLowerCase(), top = result.top_tasks[0];
    const notice = apiConfigured ? 'AI explanation is currently unavailable.' : 'AI backend is not connected. This answer uses your loaded tasks.';
    if (/first|priority|prioritas|dulu|why|kenapa|rank/.test(m))
        return { mode: 'deterministic', message: top ? `Start with “${top.title}” (${top.priority_score}/100). ${top.reason}. Estimated remaining work: ${top.remaining_minutes} minutes.` : result.summary, notice, task_ids: top ? [top.task_id] : [] };
    if (/urgent|mendesak|deadline/.test(m)) {
        const urgent = result.top_tasks.filter(t => t.reason_codes.some(c => ['OVERDUE', 'DUE_WITHIN_24H', 'DUE_WITHIN_72H'].includes(c)));
        return { mode: 'deterministic', message: urgent.length ? urgent.slice(0, 5).map(t => `${t.title}: ${t.reason}`).join('\n') : 'No deadlines within 3 days in this overview.', notice, task_ids: urgent.slice(0, 5).map(t => t.task_id) };
    }
    if (/work|remaining|sisa|beban|plan|tonight|malam|jam|hours/.test(m))
        return { mode: 'deterministic', message: `${result.active_task_count} active tasks; approximately ${result.remaining_workload_minutes} minutes of remaining work${result.context_truncated ? ' in this limited overview' : ''}. Use Daily Planner to choose your available start and end time and see which tasks fit.`, notice, task_ids: [] };
    return { mode: 'unavailable', message: 'AI explanation is currently unavailable. I can still answer questions about your first priority, urgent tasks, or remaining workload.', notice, task_ids: [] };
}
export function AssistantPage({ tasks, userId }: Props) {
    const [messages, setMessages] = useState<{
        role: 'user' | 'assistant';
        text: string;
        mode?: string;
    }[]>([]), [input, setInput] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { setMessages([]); setError(''); }, [userId]);
    async function send(e: FormEvent) { e.preventDefault(); if (!userId || !input.trim() || busy)
        return; const question = input.trim(); setBusy(true); setError(''); try {
        let answer: AIResult;
        if (apiConfigured) {
            try {
                answer = await apiRequest<AIResult>('/api/v1/assistant/chat', { message: question });
            }
            catch (e) {
                if (e instanceof ApiError && [0, 500, 503].includes(e.status))
                    answer = deterministicReply(question, localRecommendations(tasks));
                else
                    throw e;
            }
        }
        else
            answer = deterministicReply(question, localRecommendations(tasks));
        setMessages(m => [...m.slice(-18), { role: 'user', text: question }, { role: 'assistant', text: answer.message + (answer.notice ? '\n\n' + answer.notice : ''), mode: answer.mode }]);
        setInput('');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <><div className="page-heading"><div><div className="eyebrow">A LITTLE CLARITY FOR YOUR DAY</div><h1>AI Assistant</h1><p>Ask about your tasks and priorities. Your data stays unchanged.</p></div><span className="subtle-chip">READ-ONLY</span></div><section className="panel p2-chat"><div className="p2-suggestions">{['What should I work on first?', 'Which assignments are urgent?', 'How much work do I still have?', 'Help me plan 3 hours tonight.'].map(q => <button key={q} className="button secondary" onClick={() => setInput(q)} disabled={busy || !userId}>{q}</button>)}</div><p className="p2-hint">Uses your active tasks only. Messages are kept in this page session; each question is answered independently. No documents or external sources.</p><div className="p2-messages" aria-live="polite">{messages.map((m, i) => <div key={i} className={'p2-message ' + m.role}><strong>{m.role === 'user' ? 'You' : m.mode === 'ai' ? 'AI-assisted guidance' : 'Task-based guidance'}</strong><p>{m.text}</p></div>)}{busy && <p role="status">Preparing your answer…</p>}</div>{error && <p role="alert" className="form-error">{error}</p>}<form onSubmit={send} className="p2-chat-form"><label className="sr-only" htmlFor="assistant-message">Your question</label><textarea id="assistant-message" maxLength={1000} required rows={2} placeholder="What should I focus on today?" value={input} onChange={e => setInput(e.target.value)} disabled={busy || !userId}/><button className="button primary" disabled={busy || !userId || !input.trim()}><Send size={17}/>Send</button></form></section></>;
}
