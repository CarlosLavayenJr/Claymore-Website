'use server'

import { redirect } from 'next/navigation'
import type { ApiResult, Role } from '@/lib/claymores/api-client'
import { memberApi } from '@/lib/claymores/member'

const ADMIN = '/account/admin'

function role(value: FormDataEntryValue | null): Role | null {
    return value === 'player' || value === 'admin' ? value : null
}

function done(notice: string): never {
    redirect(`${ADMIN}?notice=${notice}`)
}

function failed(result: ApiResult<unknown>, fallback: string): never {
    if (result.ok) done(fallback)
    if (result.status === 401) redirect(`/sign-in?error=expired&callbackUrl=${ADMIN}`)
    const code = result.status === 403 ? 'forbidden'
        : result.status === 404 ? 'not_found'
        : result.status === 409 ? 'conflict'
        : result.status === 400 ? 'invalid'
        : 'unavailable'
    redirect(`${ADMIN}?error=${code}`)
}

async function admin() {
    const session = await memberApi()
    if (!session) redirect(`/sign-in?callbackUrl=${ADMIN}`)
    return session.api
}

export async function approveJoinRequest(id: string, formData: FormData) {
    const r = role(formData.get('role'))
    if (!r) redirect(`${ADMIN}?error=invalid`)
    const result = await (await admin()).approveJoinRequest(id, r)
    if (result.ok) done('approved')
    failed(result, 'approved')
}

export async function denyJoinRequest(id: string, formData: FormData) {
    const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)
    const result = await (await admin()).denyJoinRequest(id, reason || undefined)
    if (result.ok) done('denied')
    failed(result, 'denied')
}

export async function saveInvitation(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const r = role(formData.get('role'))
    if (!r || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) redirect(`${ADMIN}?error=invalid`)
    const result = await (await admin()).putInvitation(email, r)
    if (result.ok) done('invited')
    failed(result, 'invited')
}

export async function removeInvitation(email: string) {
    const result = await (await admin()).deleteInvitation(email)
    if (result.ok) done('removed')
    failed(result, 'removed')
}
