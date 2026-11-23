import { HttpResponse } from 'msw/http'

export const API = import.meta.env.VITE_API_ORIGIN
const meta = () => ({ requestId: `mock_${Math.random().toString(36).slice(2, 10)}`, timestamp: new Date().toISOString() })
export const ok = <T,>(data: T, status = 200) => HttpResponse.json({ data, error: null, meta: meta() }, { status })
export const fail = (status: number, code: string, message: string) => HttpResponse.json({ data: null, error: { code, message }, meta: meta() }, { status })
