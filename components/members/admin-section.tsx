'use client'

import { useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

const KEY = 'claymores-admin-open:'

/**
 * A Club Admin card that folds away. The summary line still says what's inside ("2 waiting",
 * "12 of 30 paid") so the page reads at a glance when everything is closed. Sections that need
 * action pass `defaultOpen`. Whether the admin left a section open or closed is remembered in
 * this browser; `defaultOpen` wins while there's something to act on.
 */
export function AdminSection({ id, title, status, defaultOpen = false, needsAction = false, children }: {
    id: string
    title: string
    status?: React.ReactNode
    defaultOpen?: boolean
    /** Open regardless of what was remembered (e.g. join requests are waiting). */
    needsAction?: boolean
    children: React.ReactNode
}) {
    const ref = useRef<HTMLDetailsElement>(null)

    useEffect(() => {
        if (needsAction || !ref.current) return
        // After a save the page comes back to /account/admin#<section>: show that section.
        if (window.location.hash === `#${id}`) {
            ref.current.open = true
            ref.current.scrollIntoView({ block: 'start' })
            return
        }
        try {
            const saved = window.localStorage.getItem(KEY + id)
            if (saved === '1') ref.current.open = true
            if (saved === '0') ref.current.open = false
        } catch {
            // Storage blocked: keep the default.
        }
    }, [id, needsAction])

    return (
        <details
            ref={ref}
            id={id}
            open={defaultOpen || needsAction}
            onToggle={event => {
                try {
                    window.localStorage.setItem(KEY + id, (event.currentTarget as HTMLDetailsElement).open ? '1' : '0')
                } catch {
                    // Storage blocked: nothing to remember.
                }
            }}
            className="group scroll-mt-24 rounded-lg border border-[#EAEAEA] bg-white"
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 marker:hidden sm:p-6 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                    <h2 className="font-claymore text-2xl text-[#111111]">{title}</h2>
                    {status && <span className="mt-1 block text-sm text-[#555555]">{status}</span>}
                </span>
                <ChevronDown
                    aria-hidden
                    className="h-5 w-5 shrink-0 text-[#555555] transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="border-t border-[#EAEAEA] p-5 sm:p-6">{children}</div>
        </details>
    )
}
