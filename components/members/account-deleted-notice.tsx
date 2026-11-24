'use client'

import { useEffect, useState } from 'react'
import { Notice } from '@/components/members/member-ui'
import { ACCOUNT_DELETED_PARAM } from '@/lib/claymores/account-deletion'

/**
 * Shown on the homepage after `/account` deletes a member's account
 * (`/?accountDeleted=1`). Read on the client so the homepage stays static;
 * the flag is removed from the address bar once shown.
 */
export function AccountDeletedNotice() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const url = new URL(window.location.href)
        if (url.searchParams.get(ACCOUNT_DELETED_PARAM) !== '1') return
        setShow(true)
        url.searchParams.delete(ACCOUNT_DELETED_PARAM)
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }, [])

    if (!show) return null
    return (
        <div className="bg-white">
            <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
                <Notice tone="success" title="Your account has been deleted">
                    You&apos;re signed out on this device, and your member access has ended everywhere. Dues and payment
                    records are kept as part of the club&apos;s financial records.
                </Notice>
            </div>
        </div>
    )
}
