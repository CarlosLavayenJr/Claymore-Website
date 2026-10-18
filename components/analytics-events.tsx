'use client'

import { useEffect } from 'react'
import { track } from '@vercel/analytics'

// Site-wide click tracking for Vercel Web Analytics custom events, so individual
// CTAs don't each need wiring. Events (max 2 properties each):
//   cta_click      { to, from }   — any link into the signup funnel (/contact, /join)
//   outbound_click { type, from } — social, shop, email, phone, maps, other external
// Add data-track="event_name" to any element to send a custom event instead.

const FUNNEL_PATHS = new Set(['/contact', '/join'])

function outboundType(url: URL): string {
    if (url.protocol === 'mailto:') return 'email'
    if (url.protocol === 'tel:') return 'phone'
    const host = url.hostname.replace(/^www\./, '')
    if (/(facebook|instagram|youtube|tiktok|x)\.com$/.test(host)) return 'social'
    if (host === 'tytanrugby.com') return 'shop'
    if (host.endsWith('google.com') && url.pathname.startsWith('/maps')) return 'maps'
    return 'other'
}

export default function AnalyticsEvents() {
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const el = (e.target as Element | null)?.closest<HTMLElement>('a[href], [data-track]')
            if (!el) return
            const from = window.location.pathname

            const custom = el.dataset.track
            if (custom) {
                track(custom, { from })
                return
            }

            const href = el.getAttribute('href')
            if (!href) return
            const url = new URL(href, window.location.href)

            if (url.origin === window.location.origin) {
                if (FUNNEL_PATHS.has(url.pathname) && url.pathname !== from) {
                    track('cta_click', { to: url.pathname, from })
                }
                return
            }
            track('outbound_click', { type: outboundType(url), from })
        }

        document.addEventListener('click', onClick, { capture: true })
        return () => document.removeEventListener('click', onClick, { capture: true })
    }, [])

    return null
}
