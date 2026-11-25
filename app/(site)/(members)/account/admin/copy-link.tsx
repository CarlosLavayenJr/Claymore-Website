'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** The invite URL in a read-only box with a Copy button (and Share where the phone offers it). */
export function CopyLink({ url }: { url: string }) {
    const [copied, setCopied] = useState(false)
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    async function copy() {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard blocked: the box is selectable instead.
        }
    }

    return (
        <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="invite-link-url" className="sr-only">Invite link</label>
            <input
                id="invite-link-url"
                readOnly
                value={url}
                onFocus={event => event.currentTarget.select()}
                className="block w-full min-w-0 rounded-md border border-[#EAEAEA] bg-white px-3 py-2.5 font-mono text-sm text-[#111111]"
            />
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#77c3ef] px-4 py-2.5 font-claymore text-base text-white transition-colors hover:bg-[#a0d5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                >
                    {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy link'}
                </button>
                {canShare && (
                    <button
                        type="button"
                        onClick={() => navigator.share({ title: 'Join the Claymores', url }).catch(() => {})}
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[#77c3ef] px-4 py-2.5 font-claymore text-base text-[#77c3ef] transition-colors hover:bg-[#77c3ef] hover:text-white"
                    >
                        Share
                    </button>
                )}
            </div>
            <span aria-live="polite" className="sr-only">{copied ? 'Link copied' : ''}</span>
        </div>
    )
}
