'use client'

import { useFormStatus } from 'react-dom'

/** Submit button that asks for confirmation first (for removals and denials). */
export function ConfirmSubmit({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            className={className}
            disabled={pending}
            onClick={event => {
                if (!window.confirm(message)) event.preventDefault()
            }}
        >
            {pending ? 'Working…' : children}
        </button>
    )
}
