import type { NextRequest } from 'next/server'
import { handlers } from '@/auth'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'

function notConfigured() {
    return new Response('Not found', { status: 404 })
}

export function GET(request: NextRequest) {
    if (!memberAuthEnabled()) return notConfigured()
    return handlers.GET(request)
}

export function POST(request: NextRequest) {
    if (!memberAuthEnabled()) return notConfigured()
    return handlers.POST(request)
}
