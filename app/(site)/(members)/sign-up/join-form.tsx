'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { signInWithGoogle } from '../actions'
import { submitJoinRequest } from './actions'
import { ctaClass, GoogleButton, inputClass, labelClass, linkClass, Notice } from '@/components/members/member-ui'
import { JOIN_LIMITS, type JoinFormState } from '@/lib/claymores/join-request'

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button type="submit" className={ctaClass} disabled={pending} aria-disabled={pending}>
            {pending ? 'Sending…' : 'Send request'}
        </button>
    )
}

export function JoinForm({ name, email }: { name: string | null; email: string | null }) {
    const [state, action] = useActionState<JoinFormState, FormData>(submitJoinRequest, { status: 'idle' })

    if (state.status === 'sent') {
        return (
            <Notice tone="success" title="Request sent — a club admin will review it">
                We&apos;ll let you know at {state.email ?? 'your Google email'}. Once you&apos;re approved,{' '}
                <Link href="/sign-in" className={linkClass}>sign in</Link> with the same Google account.
            </Notice>
        )
    }
    if (state.status === 'already_member') {
        return (
            <Notice tone="info" title="You're already a member">
                That Google account already has access. <Link href="/sign-in" className={linkClass}>Sign in</Link> to
                see your account.
            </Notice>
        )
    }
    if (state.status === 'denied_recently') {
        return (
            <Notice tone="error" title="Your recent request wasn't approved">
                You can request again later. Questions? <Link href="/contact" className={linkClass}>Contact the club</Link>.
            </Notice>
        )
    }
    if (state.status === 'expired') {
        return (
            <div className="space-y-5">
                <Notice tone="info" title="Confirm your Google account again">
                    For your security, the Google step only lasts 10 minutes. Continue with Google, then send your
                    request.
                </Notice>
                <form action={signInWithGoogle}>
                    <input type="hidden" name="callbackUrl" value="/account" />
                    <GoogleButton />
                </form>
            </div>
        )
    }

    const error = state.status === 'error' ? state : null
    const values = error?.values
    const invalid = (field: string) => error?.field === field

    return (
        <form action={action} className="space-y-5" noValidate>
            {error && <Notice tone="error" title={error.message} />}
            <p className="text-sm text-[#555555]">
                Signed in with Google as <span className="font-semibold text-[#111111]">{email ?? 'your Google account'}</span>.
            </p>
            <div>
                <label htmlFor="join-name" className={labelClass}>Name</label>
                <input
                    id="join-name"
                    name="name"
                    required
                    autoComplete="name"
                    maxLength={JOIN_LIMITS.name}
                    defaultValue={values?.name ?? name ?? ''}
                    aria-invalid={invalid('name') || undefined}
                    className={`${inputClass} mt-1`}
                />
            </div>
            <div>
                <label htmlFor="join-phone" className={labelClass}>
                    Phone <span className="font-normal text-[#555555]">(optional)</span>
                </label>
                <input
                    id="join-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={JOIN_LIMITS.phone}
                    defaultValue={values?.phone ?? ''}
                    aria-invalid={invalid('phone') || undefined}
                    className={`${inputClass} mt-1`}
                />
            </div>
            <div>
                <label htmlFor="join-message" className={labelClass}>
                    Tell us about your rugby experience <span className="font-normal text-[#555555]">(optional)</span>
                </label>
                <textarea
                    id="join-message"
                    name="message"
                    rows={4}
                    maxLength={JOIN_LIMITS.message}
                    defaultValue={values?.message ?? ''}
                    aria-invalid={invalid('message') || undefined}
                    className={`${inputClass} mt-1`}
                    placeholder="Positions you've played, how long, and which Claymores practices you've been to."
                />
            </div>
            <SubmitButton />
        </form>
    )
}
