// Validation for the "Request to join" form. Shared by the server action and tests.

export type JoinValues = { name: string; phone: string; message: string }

export type JoinFormState =
    | { status: 'idle' }
    | { status: 'sent'; email: string | null }
    | { status: 'expired' }
    | { status: 'already_member' }
    | { status: 'denied_recently' }
    | { status: 'error'; message: string; field?: string | null; values?: JoinValues }

export const JOIN_LIMITS = { name: 100, phone: 30, message: 1000 } as const

type Parsed =
    | { ok: true; value: { name: string; phone?: string; message?: string }; values: JoinValues }
    | { ok: false; field: keyof JoinValues; message: string; values: JoinValues }

export function validateJoinRequest(form: Pick<FormData, 'get'>): Parsed {
    const values: JoinValues = {
        name: String(form.get('name') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim(),
        message: String(form.get('message') ?? '').trim(),
    }
    if (!values.name) return { ok: false, field: 'name', message: 'Enter your name.', values }
    if (values.name.length > JOIN_LIMITS.name) {
        return { ok: false, field: 'name', message: `Keep your name under ${JOIN_LIMITS.name} characters.`, values }
    }
    if (values.phone && (!/^[0-9+().\-\s]{7,}$/.test(values.phone) || values.phone.length > JOIN_LIMITS.phone)) {
        return { ok: false, field: 'phone', message: 'Enter a valid phone number, or leave it blank.', values }
    }
    if (values.message.length > JOIN_LIMITS.message) {
        return { ok: false, field: 'message', message: `Keep your message under ${JOIN_LIMITS.message} characters.`, values }
    }
    return {
        ok: true,
        values,
        value: {
            name: values.name,
            ...(values.phone ? { phone: values.phone } : {}),
            ...(values.message ? { message: values.message } : {}),
        },
    }
}
