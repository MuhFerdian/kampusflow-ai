import { supabase } from './supabase';
const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || '';
export const apiConfigured = Boolean(base);
export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const messages: Record<number, string> = { 401: 'Your session has expired. Please sign in again.', 403: 'Access to this data was denied.', 413: 'Your request is too large. Please shorten it.', 422: 'Check your request, dates and text length.', 429: 'Too many requests. Please wait a minute.', 500: 'The service encountered a problem. Please try again.', 503: 'The service is temporarily unavailable.' };
export async function apiRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!base)
        throw new ApiError(503, 'The AI backend is not connected yet.');
    if (!supabase)
        throw new ApiError(401, messages[401]);
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session)
        throw new ApiError(401, messages[401]);
    const timer = new AbortController(), timeout = setTimeout(() => timer.abort(), 30000);
    const abort = () => timer.abort();
    signal?.addEventListener('abort', abort);
    try {
        if (signal?.aborted)
            throw new Error('Cancelled');
        const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: timer.signal });
        if (!r.ok)
            throw new ApiError(r.status, messages[r.status] || 'Unable to complete this request.');
        return await r.json() as T;
    }
    catch (e) {
        if (e instanceof ApiError)
            throw e;
        throw new ApiError(0, 'Could not reach the backend. Please try again.');
    }
    finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
}
