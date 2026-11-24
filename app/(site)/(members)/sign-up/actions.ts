'use server'

import { ClaymoresApiClient } from '@/lib/claymores/api-client'
import { apiBaseUrl, memberAuthEnabled } from '@/lib/claymores/auth-env'
import { getPendingGoogle } from '@/lib/claymores/pending-google'
import { validateJoinRequest, type JoinFormState } from '@/lib/claymores/join-request'

export async function submitJoinRequest(_previous: JoinFormState, formData: FormData): Promise<JoinFormState> {
    if (!memberAuthEnabled()) return { status: 'error', message: 'Sign-in is not available yet.' }

    const pending = await getPendingGoogle()
    if (!pending) return { status: 'expired' }

    const parsed = validateJoinRequest(formData)
    if (!parsed.ok) return { status: 'error', message: parsed.message, field: parsed.field, values: parsed.values }

    const api = new ClaymoresApiClient({ baseUrl: apiBaseUrl() })
    const result = await api.requestAccess({ idToken: pending.idToken, ...parsed.value })

    if (result.ok) return { status: 'sent', email: result.data?.email ?? pending.email ?? null }
    if (result.status === 409) return { status: 'already_member' }
    // 429 is either {"status":"denied_recently"} or {"error":"rate_limited"}.
    if (result.status === 429 && result.error === 'denied_recently') return { status: 'denied_recently' }
    if (result.status === 429) {
        return { status: 'error', values: parsed.values, message: 'Too many requests. Try again in a few minutes.' }
    }
    if (result.status === 401) return { status: 'expired' }
    if (result.status === 400) {
        const field = result.field ?? null
        return {
            status: 'error',
            field,
            values: parsed.values,
            message: field ? `Check the ${field} field and try again.` : 'Check the form and try again.',
        }
    }
    return {
        status: 'error',
        values: parsed.values,
        message: 'The club server didn’t respond. Try again in a minute.',
    }
}
