'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteAccount, type DeleteState } from './actions'
import { inputClass, labelClass, Notice } from '@/components/members/member-ui'
import { DELETE_CONFIRMATION } from '@/lib/claymores/account-deletion'

const dangerClass =
    'inline-flex items-center justify-center rounded-md border border-[#d63d7e] bg-[#d63d7e] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#b02a64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-50'

function DeleteButton({ ready }: { ready: boolean }) {
    const { pending } = useFormStatus()
    return (
        <button type="submit" className={`${dangerClass} w-full sm:w-auto`} disabled={!ready || pending} aria-disabled={!ready || pending}>
            {pending ? 'Deleting…' : 'Delete my account'}
        </button>
    )
}

export function DeleteAccountForm() {
    const [state, action] = useActionState<DeleteState, FormData>(deleteAccount, { error: null })
    const [typed, setTyped] = useState('')
    const id = useId()
    return (
        <form action={action} className="mt-4 space-y-3">
            <div className="sm:max-w-xs">
                <label htmlFor={id} className={labelClass}>
                    Type {DELETE_CONFIRMATION} to confirm
                </label>
                <input
                    id={id}
                    name="confirm"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                    value={typed}
                    onChange={event => setTyped(event.target.value)}
                    className={`${inputClass} mt-1`}
                />
            </div>
            <DeleteButton ready={typed.trim() === DELETE_CONFIRMATION} />
            {state.error && <Notice tone="error" title={state.error} />}
        </form>
    )
}
