#!/usr/bin/env node
// Tiny in-memory mock of the Claymores API member endpoints, for running the
// website's sign-in, request-to-join, account, and admin pages locally.
//
//   MOCK_API_PORT=5399 MOCK_ACCESS_TTL_SECONDS=150 node scripts/mock-claymores-api.mjs
//
// Accepted "Google" id tokens: `dev-id-token:<email>` (what the development
// sign-in provider sends). Seeded invitations: admin@example.com (admin) and
// player@example.com (player). Any other email is not invited and can request
// to join. Refresh tokens rotate, and reusing an old one revokes the family,
// like the real API. Public sports endpoints return empty data.
//
// Dues checkout accepts `returnTo: "app" | "web"`. MOCK_WEB_CHECKOUT=off makes
// "web" fail with 400 web_checkout_unavailable (API without Stripe:WebReturnUrl);
// MOCK_STRIPE_DOWN=1 makes every checkout fail with 502. The returned "Stripe"
// URL is fake; open `/account?checkout=returned` or `?checkout=cancelled` on the
// website to see the return banners. An open checkout (admin@example.com's
// dues) is reused whatever amount is sent, like the real API.
//
// DELETE /v1/me deletes the caller's account (204) and answers 409 last_admin
// for the only admin, so delete player@example.com to try it.

import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'

const port = Number(process.env.MOCK_API_PORT ?? 5399)
const accessTtl = Number(process.env.MOCK_ACCESS_TTL_SECONDS ?? 300) * 1000
const webCheckout = process.env.MOCK_WEB_CHECKOUT !== 'off'
const stripeDown = process.env.MOCK_STRIPE_DOWN === '1'

const invitations = new Map([
    ['admin@example.com', { role: 'admin', invitedBy: 'bootstrap', invitedAt: '2026-09-01T12:00:00Z' }],
    ['player@example.com', { role: 'player', invitedBy: 'admin@example.com', invitedAt: '2026-10-02T15:30:00Z' }],
])
const accessTokens = new Map() // token -> { email, exp }
const refreshTokens = new Map() // token -> { email, family, used }
const revokedFamilies = new Set()
const joinRequests = [
    {
        id: randomUUID(), email: 'sam.prop@example.com', name: 'Sam Prop', phone: '(407) 555-0142',
        message: 'Played tighthead for 4 seasons in Tampa. Been to two Claymores practices.',
        status: 'pending', createdAt: '2026-11-20T23:10:00Z',
    },
    {
        id: randomUUID(), email: 'alex.wing@example.com', name: 'Alex Wing', phone: null,
        message: null, status: 'pending', createdAt: '2026-11-22T14:05:00Z',
    },
]
const dues = [
    { id: 'c5538aa3-989d-439b-b3e8-f21d85369f06', player: 'player@example.com', description: '2026–27 season dues', amountCents: 15000, dueDate: '2027-01-31', payments: [{ id: randomUUID(), amountCents: 5000, recordedAt: '2026-10-15T22:30:00Z' }], pendingCheckoutCents: 0 },
    { id: '7a0d2f8e-4a4c-4d6b-9a55-0f7e7c1b2d11', player: 'player@example.com', description: 'Tour kit order', amountCents: 6500, dueDate: null, payments: [{ id: randomUUID(), amountCents: 6500, recordedAt: '2026-09-03T18:00:00Z' }], pendingCheckoutCents: 0 },
    { id: '3f1e6c55-2b8f-4d7e-8f21-9c2b7d4e6a10', player: 'admin@example.com', description: '2026–27 season dues', amountCents: 15000, dueDate: '2027-01-31', payments: [], pendingCheckoutCents: 2500 },
]

const nameOf = email => email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const subjectOf = email => `mock-${Buffer.from(email).toString('hex').slice(0, 16)}`

function issue(email, family = randomUUID()) {
    const accessToken = `at.${randomBytes(16).toString('hex')}`
    const refreshToken = randomBytes(32).toString('base64url')
    const exp = Date.now() + accessTtl
    accessTokens.set(accessToken, { email, exp })
    refreshTokens.set(refreshToken, { email, family, used: false })
    return {
        accessToken,
        accessTokenExpiresAt: new Date(exp).toISOString(),
        refreshToken,
        user: { subject: subjectOf(email), name: nameOf(email), email, role: invitations.get(email)?.role ?? null },
    }
}

function emailFromIdToken(idToken) {
    if (typeof idToken !== 'string' || !idToken.startsWith('dev-id-token:')) return null
    const email = idToken.slice('dev-id-token:'.length).trim().toLowerCase()
    return /^[^@\s]+@[^@\s]+$/.test(email) ? email : null
}

function bearer(req) {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    const entry = token && accessTokens.get(token)
    if (!entry || entry.exp < Date.now()) return null
    if (!invitations.has(entry.email)) return null
    return { email: entry.email, role: invitations.get(entry.email).role }
}

function assessment(d) {
    const paid = d.payments.reduce((s, p) => s + p.amountCents, 0)
    return {
        id: d.id, playerSubject: subjectOf(d.player), description: d.description, amountCents: d.amountCents,
        dueDate: d.dueDate, paidCents: paid, balanceCents: d.amountCents - paid, pendingCheckoutCents: d.pendingCheckoutCents,
    }
}

async function readJson(req) {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (!raw) return {}
    try { return JSON.parse(raw) } catch { return null }
}

function send(res, status, body) {
    res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' })
    res.end(body === undefined ? undefined : JSON.stringify(body))
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname
    const method = req.method
    const started = Date.now()
    res.on('finish', () => console.log(`${method} ${path}${url.search} -> ${res.statusCode} (${Date.now() - started}ms)`))

    // Public sports data, enough for the website to build and render.
    if (method === 'GET' && ['/v1/fixtures', '/v1/teams', '/v1/players', '/v1/practices', '/v1/standings/seasons'].includes(path)) return send(res, 200, [])
    if (method === 'GET' && (path.startsWith('/v1/fixtures/') || path.startsWith('/v1/players/') || path === '/v1/standings' || path === '/v1/practices/schedule')) return send(res, 404, { error: 'not_found' })
    if (path === '/health') return send(res, 200, { status: 'ok' })

    const body = method === 'POST' || method === 'PUT' ? await readJson(req) : {}
    if (body === null) return send(res, 400, { error: 'invalid_request' })

    // --- Mobile auth ---
    if (method === 'POST' && path === '/v1/auth/mobile/google') {
        const email = emailFromIdToken(body.idToken)
        if (!email) return send(res, 401, { error: 'invalid_token' })
        if (!invitations.has(email)) return send(res, 403, { error: 'not_invited' })
        return send(res, 200, issue(email))
    }
    if (method === 'POST' && path === '/v1/auth/mobile/refresh') {
        const entry = refreshTokens.get(body.refreshToken)
        if (!entry || revokedFamilies.has(entry.family)) return send(res, 401, { error: 'invalid_token' })
        if (entry.used) {
            revokedFamilies.add(entry.family)
            console.log(`!! refresh token reuse detected, family ${entry.family} revoked`)
            return send(res, 401, { error: 'invalid_token' })
        }
        entry.used = true
        if (!invitations.has(entry.email)) { revokedFamilies.add(entry.family); return send(res, 403, { error: 'not_invited' }) }
        return send(res, 200, issue(entry.email, entry.family))
    }
    if (method === 'POST' && path === '/v1/auth/mobile/logout') {
        const entry = refreshTokens.get(body.refreshToken)
        if (entry) revokedFamilies.add(entry.family)
        return send(res, 204)
    }
    if (method === 'POST' && path === '/v1/auth/mobile/google/request-access') {
        const email = emailFromIdToken(body.idToken)
        if (!email) return send(res, 401, { error: 'invalid_token' })
        if (invitations.has(email)) return send(res, 409, { status: 'already_member' })
        if (typeof body.name !== 'string' || !body.name.trim()) return send(res, 400, { error: 'invalid_request', field: 'name' })
        const existing = joinRequests.find(r => r.email === email)
        if (existing?.status === 'denied') return send(res, 429, { status: 'denied_recently' })
        if (!existing) joinRequests.push({ id: randomUUID(), email, name: body.name.trim(), phone: body.phone ?? null, message: body.message ?? null, status: 'pending', createdAt: new Date().toISOString() })
        return send(res, 202, { status: 'pending', email })
    }
    if (method === 'POST' && path === '/v1/auth/mobile/google/request-status') {
        const email = emailFromIdToken(body.idToken)
        if (!email) return send(res, 401, { error: 'invalid_token' })
        return send(res, 200, { status: joinRequests.find(r => r.email === email)?.status ?? 'none' })
    }

    // --- Member ---
    const user = bearer(req)
    if (path.startsWith('/v1/me') || path.startsWith('/v1/dues') || path.startsWith('/v1/admin')) {
        if (!user) return send(res, 401, { error: 'invalid_token' })
    }
    if (method === 'DELETE' && path === '/v1/me') {
        if (user.role === 'admin' && [...invitations.values()].filter(v => v.role === 'admin').length <= 1) {
            return send(res, 409, { error: 'last_admin' })
        }
        // Access ends, every session is revoked, member and join-request records go; dues stay.
        invitations.delete(user.email)
        for (const [token, entry] of accessTokens) if (entry.email === user.email) accessTokens.delete(token)
        for (const entry of refreshTokens.values()) if (entry.email === user.email) revokedFamilies.add(entry.family)
        for (let i = joinRequests.length - 1; i >= 0; i--) if (joinRequests[i].email === user.email) joinRequests.splice(i, 1)
        return send(res, 204)
    }
    if (method === 'GET' && path === '/v1/me') {
        return send(res, 200, { subject: subjectOf(user.email), name: nameOf(user.email), email: user.email, role: user.role })
    }
    if (method === 'GET' && path === '/v1/dues/mine') return send(res, 200, dues.filter(d => d.player === user.email).map(assessment))
    let m = path.match(/^\/v1\/dues\/mine\/([^/]+)$/)
    if (method === 'GET' && m) {
        const d = dues.find(x => x.id === m[1] && x.player === user.email)
        return d ? send(res, 200, { assessment: assessment(d), payments: d.payments }) : send(res, 404, { error: 'not_found' })
    }
    m = path.match(/^\/v1\/dues\/([^/]+)\/checkout-session$/)
    if (method === 'POST' && m) {
        const d = dues.find(x => x.id === m[1] && x.player === user.email)
        if (!d) return send(res, 404, { error: 'not_found' })
        const a = assessment(d)
        if (!Number.isInteger(body.amountCents) || body.amountCents < 50) return send(res, 400, { error: 'invalid_request', field: 'amountCents' })
        const returnTo = body.returnTo ?? 'app'
        if (returnTo !== 'app' && returnTo !== 'web') return send(res, 400, { error: 'invalid_request', field: 'returnTo' })
        if (returnTo === 'web' && !webCheckout) return send(res, 400, { error: 'web_checkout_unavailable' })
        if (stripeDown) return send(res, 502, { title: 'Stripe could not create the checkout session.' })
        // Like the real API, an open checkout is reused (its amount and return target win).
        if (a.pendingCheckoutCents > 0) return send(res, 200, { url: `https://checkout.stripe.com/c/pay/mock_resume_${randomBytes(6).toString('hex')}` })
        if (body.amountCents > a.balanceCents) return send(res, 409, { error: 'overpayment' })
        return send(res, 200, { url: `https://checkout.stripe.com/c/pay/mock_${returnTo}_${randomBytes(6).toString('hex')}` })
    }

    // --- Admin ---
    if (path.startsWith('/v1/admin') && user.role !== 'admin') return send(res, 403, { error: 'forbidden' })
    if (method === 'GET' && path === '/v1/admin/join-requests') {
        const status = url.searchParams.get('status')
        return send(res, 200, joinRequests.filter(r => !status || r.status === status))
    }
    m = path.match(/^\/v1\/admin\/join-requests\/([^/]+)\/(approve|deny)$/)
    if (method === 'POST' && m) {
        const r = joinRequests.find(x => x.id === m[1])
        if (!r) return send(res, 404, { error: 'not_found' })
        if (r.status !== 'pending') return send(res, 409, { error: 'not_pending' })
        if (m[2] === 'approve') {
            if (body.role !== 'player' && body.role !== 'admin') return send(res, 400, { error: 'invalid_request', field: 'role' })
            r.status = 'approved'
            invitations.set(r.email, { role: body.role, invitedBy: user.email, invitedAt: new Date().toISOString() })
        } else {
            r.status = 'denied'
            r.reason = body.reason ?? null
        }
        return send(res, 200, r)
    }
    if (method === 'GET' && path === '/v1/admin/invitations') {
        return send(res, 200, [...invitations].map(([email, v]) => ({ email, ...v })).sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email)))
    }
    m = path.match(/^\/v1\/admin\/invitations\/([^/]+)$/)
    if (m) {
        const email = decodeURIComponent(m[1]).toLowerCase()
        if (method === 'PUT') {
            if (body.role !== 'player' && body.role !== 'admin') return send(res, 400, { error: 'invalid_request' })
            if (email === user.email && body.role !== 'admin') return send(res, 409, { error: "You can't remove your own admin role." })
            invitations.set(email, { role: body.role, invitedBy: user.email, invitedAt: invitations.get(email)?.invitedAt ?? new Date().toISOString() })
            return send(res, 200, { email, role: body.role })
        }
        if (method === 'DELETE') {
            if (email === user.email) return send(res, 409, { error: "You can't remove your own invitation." })
            return invitations.delete(email) ? send(res, 204) : send(res, 404, { error: 'not_found' })
        }
    }

    send(res, 404, { error: 'not_found' })
})

server.listen(port, '127.0.0.1', () => console.log(`Mock Claymores API on http://127.0.0.1:${port} (access TTL ${accessTtl / 1000}s)`))
