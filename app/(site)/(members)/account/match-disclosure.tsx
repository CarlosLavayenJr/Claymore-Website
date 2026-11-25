'use client'

import { useEffect, useRef } from 'react'

/**
 * A match on /account that folds to one line. Opens on its own when it's the match that needs
 * an answer (defaultOpen), or when the page comes back to #<id> after saving an answer.
 */
export function MatchDisclosure({ id, defaultOpen, summary, children }: {
    id: string
    defaultOpen: boolean
    summary: React.ReactNode
    children: React.ReactNode
}) {
    const ref = useRef<HTMLDetailsElement>(null)
    useEffect(() => {
        if (ref.current && window.location.hash === `#${id}`) {
            ref.current.open = true
            ref.current.scrollIntoView({ block: 'start' })
        }
    }, [id])
    return (
        <details ref={ref} id={id} open={defaultOpen} className="group/match scroll-mt-24 rounded-lg border border-[#EAEAEA]">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
                {summary}
                <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-[#555555] transition-transform group-open/match:rotate-180">
                    <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
                </svg>
            </summary>
            <div className="border-t border-[#EAEAEA] px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
        </details>
    )
}
