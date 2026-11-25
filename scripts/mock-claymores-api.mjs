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
//
// Match availability and lineups: GET /v1/fixtures returns seeded fixtures dated
// from today (three upcoming matches, a Highland Games club event, one played
// match), so run the site with CLAYMORES_DATA_SOURCE=api to see them. A few more
// players are seeded with answers for the first match. Fixture ids the mock
// doesn't know (Sanity ids, when the site reads Sanity) are treated as upcoming,
// so availability works either way. Answers close after match day (409); lineup
// saves validate like the API (400 { error }).

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
for (const email of ['tom.hooker@example.com', 'ben.lock@example.com', 'sam.flanker@example.com', 'jack.scrumhalf@example.com', 'leo.centre@example.com', 'max.wing@example.com']) {
    invitations.set(email, { role: 'player', invitedBy: 'admin@example.com', invitedAt: '2026-10-05T12:00:00Z' })
}
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
    { id: 'c5538aa3-989d-439b-b3e8-f21d85369f06', player: 'player@example.com', description: '2026–27 season dues', amountCents: 15000, dueDate: '2027-01-31', payments: [{ id: randomUUID(), amountCents: 5000, recordedAt: '2026-10-15T22:30:00Z', method: 'cash', note: 'Paid at Tuesday practice' }], pendingCheckoutCents: 0 },
    { id: '7a0d2f8e-4a4c-4d6b-9a55-0f7e7c1b2d11', player: 'player@example.com', description: 'Tour kit order', amountCents: 6500, dueDate: null, payments: [{ id: randomUUID(), amountCents: 6500, recordedAt: '2026-09-03T18:00:00Z', method: 'stripe' }], pendingCheckoutCents: 0 },
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
    const live = d.payments.filter(p => !p.voidedAt)
    const paid = live.reduce((s, p) => s + p.amountCents, 0)
    const credited = live.filter(p => p.method === 'volunteer' || p.method === 'waived').reduce((s, p) => s + p.amountCents, 0)
    return {
        id: d.id, playerSubject: subjectOf(d.player), description: d.description, amountCents: d.amountCents,
        dueDate: d.dueDate, paidCents: paid, balanceCents: d.amountCents - paid, pendingCheckoutCents: d.pendingCheckoutCents,
        creditedCents: credited,
    }
}

const inviteLinks = [] // { id, token, createdBy, createdAt, expiresAt, revokedAt, uses }
const linkShape = l => ({ ...l, active: !l.revokedAt && new Date(l.expiresAt) > new Date() })
let automatic = { enabled: false, description: '', amountCents: 0, dueDate: null }

// --- Fixtures, availability, lineups ---
const orlandoDate = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const daysFromToday = n => orlandoDate(new Date(Date.now() + n * 86400000))
const seasonOf = date => { const [y, m] = date.split('-').map(Number); return m >= 8 ? y + 1 : y }
const fixture = (id, offset, homeTeam, awayTeam, extra = {}) => {
    const date = daysFromToday(offset)
    return {
        id, updatedAt: new Date().toISOString(), date, season: seasonOf(date), homeTeam, awayTeam, homeScore: 0, awayScore: 0,
        status: 'upcoming', matchType: 'league', competition: 'Florida Rugby Union D3', note: null, venue: null,
        kickoffTime: '1:00 PM', homeLogo: null, awayLogo: null, homeTeamSlug: null, awayTeamSlug: null, ...extra,
    }
}
const fixtures = [
    fixture('mock-fixture-played', -9, 'Daytona (D3)', 'Claymores', { status: 'played', homeScore: 12, awayScore: 24 }),
    fixture('mock-fixture-lakeland', 3, 'Claymores', 'Lakeland (D3)', { venue: 'Barnett Park, Orlando' }),
    fixture('mock-fixture-games', 10, 'Claymores', 'Claymores', { competition: 'highland games', matchType: 'friendly', kickoffTime: '10:00 AM' }),
    fixture('mock-fixture-tampa', 17, 'Tampa Bay (D3)', 'Claymores', { kickoffTime: '2:00 PM' }),
    fixture('mock-fixture-sarasota', 31, 'Claymores', 'Sarasota (D3)', { venue: 'Barnett Park, Orlando', matchType: 'friendly', competition: 'Friendly' }),
].sort((a, b) => a.date.localeCompare(b.date))

const answers = new Map() // fixtureId -> Map(email -> { status, note, updatedAt })
const answersFor = id => answers.get(id) ?? answers.set(id, new Map()).get(id)
for (const [email, status, note] of [
    ['tom.hooker@example.com', 'available', null], ['ben.lock@example.com', 'available', null],
    ['sam.flanker@example.com', 'maybe', 'First half only, wedding that evening'], ['jack.scrumhalf@example.com', 'available', null],
    ['max.wing@example.com', 'unavailable', 'Hamstring'],
]) answersFor('mock-fixture-lakeland').set(email, { status, note, updatedAt: '2026-11-20T15:00:00Z' })
const lineups = new Map() // fixtureId -> { status, publishedAt, updatedAt, slots: [{ number, email }] }
const POSITIONS = ['Loosehead prop', 'Hooker', 'Tighthead prop', 'Lock', 'Lock', 'Blindside flanker', 'Openside flanker', 'Number 8', 'Scrum-half', 'Fly-half', 'Left wing', 'Inside centre', 'Outside centre', 'Right wing', 'Fullback']

/** null: no such fixture. Unknown ids (Sanity mode) count as upcoming. */
function fixtureDate(id) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return null
    return fixtures.find(f => f.id === id)?.date ?? '9999-12-31'
}
function roster(id) {
    const a = answersFor(id)
    return [...invitations.keys()].map(email => {
        const r = a.get(email)
        return { subject: subjectOf(email), email, name: nameOf(email), status: r?.status ?? null, note: r?.note ?? null, updatedAt: r?.updatedAt ?? null }
    })
}
const countOf = r => ({
    available: r.filter(m => m.status === 'available').length, maybe: r.filter(m => m.status === 'maybe').length,
    unavailable: r.filter(m => m.status === 'unavailable').length, noReply: r.filter(m => m.status === null).length,
})
function mine(id, email) {
    const r = roster(id)
    const me = r.find(m => m.email === email)
    return { fixtureId: id, status: me?.status ?? null, note: me?.note ?? null, updatedAt: me?.updatedAt ?? null, counts: countOf(r), open: fixtureDate(id) >= orlandoDate(new Date()) }
}
function lineupShape(id, publishedOnly) {
    const l = lineups.get(id)
    if (!l || (publishedOnly && l.status !== 'published')) return { fixtureId: id, status: 'none', publishedAt: null, updatedAt: null, slots: [] }
    return {
        fixtureId: id, status: l.status, publishedAt: l.publishedAt, updatedAt: l.updatedAt,
        slots: l.slots.map(s => ({ number: s.number, position: s.number <= 15 ? POSITIONS[s.number - 1] : 'Replacement', subject: subjectOf(s.email), name: invitations.has(s.email) ? nameOf(s.email) : null })),
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
    if (method === 'GET' && path === '/v1/fixtures') return send(res, 200, fixtures)
    if (method === 'GET' && ['/v1/teams', '/v1/players', '/v1/practices', '/v1/standings/seasons'].includes(path)) return send(res, 200, [])
    const fixtureDetail = path.match(/^\/v1\/fixtures\/([^/]+)$/)
    if (method === 'GET' && fixtureDetail) {
        const f = fixtures.find(x => x.id === decodeURIComponent(fixtureDetail[1]))
        return f ? send(res, 200, f) : send(res, 404, { error: 'not_found' })
    }
    if (method === 'GET' && (path.startsWith('/v1/players/') || path === '/v1/standings' || path === '/v1/practices/schedule')) return send(res, 404, { error: 'not_found' })
    if (path === '/health') return send(res, 200, { status: 'ok' })

    const body = method === 'POST' || method === 'PUT' || method === 'PATCH' ? await readJson(req) : {}
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
    if (method === 'POST' && path === '/v1/auth/mobile/google/redeem-invite') {
        const email = emailFromIdToken(body.idToken)
        if (!email) return send(res, 401, { error: 'invalid_token' })
        const link = inviteLinks.find(l => l.token === body.inviteToken && linkShape(l).active)
        if (!link) return send(res, 410, { error: 'invite_link_invalid' })
        if (invitations.has(email)) return send(res, 200, { status: 'already_member', email })
        invitations.set(email, { role: 'player', invitedBy: 'invite link', invitedAt: new Date().toISOString() })
        link.uses++
        return send(res, 200, { status: 'joined', email })
    }
    if (method === 'POST' && path === '/v1/auth/mobile/google/request-status') {
        const email = emailFromIdToken(body.idToken)
        if (!email) return send(res, 401, { error: 'invalid_token' })
        return send(res, 200, { status: joinRequests.find(r => r.email === email)?.status ?? 'none' })
    }

    // --- Member ---
    const user = bearer(req)
    if (path.startsWith('/v1/me') || path.startsWith('/v1/dues') || path.startsWith('/v1/admin') || path.startsWith('/v1/fixtures/') || path.startsWith('/v1/availability')) {
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
        return d ? send(res, 200, { assessment: assessment(d), payments: d.payments.filter(p => !p.voidedAt).map(({ id, amountCents, recordedAt, method }) => ({ id, amountCents, recordedAt, method })) }) : send(res, 404, { error: 'not_found' })
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

    // --- Availability and lineups (member) ---
    if (method === 'GET' && path === '/v1/availability/mine') {
        const today = orlandoDate(new Date())
        const rows = []
        for (const [id, a] of answers) {
            const r = a.get(user.email)
            if (r && fixtureDate(id) >= today) rows.push({ fixtureId: id, status: r.status, note: r.note })
        }
        return send(res, 200, rows)
    }
    m = path.match(/^\/v1\/fixtures\/([^/]+)\/(availability|lineup)$/)
    if (m) {
        const id = decodeURIComponent(m[1])
        if (!fixtureDate(id)) return send(res, 404, { error: 'not_found' })
        if (m[2] === 'lineup' && method === 'GET') return send(res, 200, lineupShape(id, true))
        if (m[2] === 'availability' && method === 'GET') return send(res, 200, mine(id, user.email))
        if (m[2] === 'availability' && method === 'PUT') {
            const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : null
            const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
            if (!['available', 'maybe', 'unavailable'].includes(status) || note?.length > 200) return send(res, 400, { error: 'Status must be available, maybe or unavailable, and the note at most 200 characters.' })
            if (fixtureDate(id) < orlandoDate(new Date())) return send(res, 409, { error: 'This match has been played, so answers are closed.' })
            const prev = answersFor(id).get(user.email)
            const changed = !prev || prev.status !== status || prev.note !== note
            answersFor(id).set(user.email, { status, note, updatedAt: changed ? new Date().toISOString() : prev.updatedAt })
            return send(res, 200, mine(id, user.email))
        }
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
    if (method === 'GET' && path === '/v1/admin/members') {
        return send(res, 200, [...invitations.keys()].map(email => ({ subject: subjectOf(email), email, name: nameOf(email) })))
    }
    const playerOf = subject => [...invitations.keys()].find(e => subjectOf(e) === subject)
    if (method === 'GET' && path === '/v1/admin/dues') return send(res, 200, dues.filter(d => !d.removed).map(assessment))
    if (method === 'GET' && path === '/v1/admin/dues/automatic') return send(res, 200, automatic)
    if (method === 'PUT' && path === '/v1/admin/dues/automatic') {
        automatic = { enabled: Boolean(body.enabled), description: body.description, amountCents: body.amountCents, dueDate: body.dueDate ?? null }
        return send(res, 200, automatic)
    }
    if (method === 'POST' && path === '/v1/admin/dues') {
        const player = playerOf(body.playerSubject)
        if (!player || !(body.amountCents > 0)) return send(res, 400, { error: 'Provide a player and a positive amount.' })
        dues.push({ id: body.id, player, description: body.description, amountCents: body.amountCents, dueDate: body.dueDate ?? null, payments: [], pendingCheckoutCents: 0 })
        return send(res, 201, { id: body.id })
    }
    if (method === 'POST' && path === '/v1/admin/dues/all-members') {
        let created = 0, skipped = 0
        for (const player of invitations.keys()) {
            if (body.skipExisting !== false && dues.some(d => d.player === player && d.description.toLowerCase() === body.description.toLowerCase())) { skipped++; continue }
            dues.push({ id: randomUUID(), player, description: body.description, amountCents: body.amountCents, dueDate: body.dueDate ?? null, payments: [], pendingCheckoutCents: 0 })
            created++
        }
        return send(res, 200, { created, skipped, members: invitations.size })
    }
    m = path.match(/^\/v1\/admin\/dues\/([^/]+)$/)
    if (m && method === 'GET') {
        const d = dues.find(x => x.id === m[1] && !x.removed)
        return d ? send(res, 200, { assessment: assessment(d), payments: d.payments }) : send(res, 404, { error: 'not_found' })
    }
    if (m && method === 'DELETE') {
        const d = dues.find(x => x.id === m[1] && !x.removed)
        if (!d) return send(res, 404, { error: 'not_found' })
        if (d.payments.some(p => !p.voidedAt) || d.pendingCheckoutCents > 0) return send(res, 409, { error: 'This item has payments or a card checkout in progress, so it can’t be removed.' })
        d.removed = true
        return send(res, 204)
    }
    m = path.match(/^\/v1\/admin\/dues\/([^/]+)\/payments$/)
    if (m && method === 'POST') {
        const d = dues.find(x => x.id === m[1] && !x.removed)
        if (!d) return send(res, 404, { error: 'not_found' })
        if (body.amountCents > assessment(d).balanceCents - d.pendingCheckoutCents) return send(res, 409, { error: 'Payment exceeds the available balance after any pending checkout.' })
        if ((body.method === 'volunteer' || body.method === 'waived') && !body.note?.trim()) return send(res, 400, { error: 'Volunteer or waived need a note.' })
        d.payments.push({ id: body.id, amountCents: body.amountCents, recordedAt: new Date().toISOString(), method: body.method ?? 'other', note: body.note?.trim() || null })
        return send(res, 200, { id: body.id })
    }
    m = path.match(/^\/v1\/admin\/dues\/([^/]+)\/payments\/([^/]+)(\/void)?$/)
    if (m) {
        const p = dues.find(x => x.id === m[1] && !x.removed)?.payments.find(x => x.id === m[2])
        if (!p) return send(res, 404, { error: 'not_found' })
        if (m[3] && method === 'POST') {
            const reason = body.reason?.trim()
            if (!reason) return send(res, 400, { error: 'Say why it’s being undone, in at most 500 characters.' })
            if (p.voidedAt) return p.voidReason === reason ? send(res, 204) : send(res, 409, { error: 'This payment was already undone.' })
            Object.assign(p, { voidedAt: new Date().toISOString(), voidedBy: user.email, voidReason: reason })
            return send(res, 204)
        }
        if (!m[3] && method === 'PATCH') {
            if (p.voidedAt) return send(res, 409, { error: 'This payment was undone, so its note can’t change.' })
            const note = body.note?.trim() || null
            if (!note && (p.method === 'volunteer' || p.method === 'waived')) return send(res, 400, { error: 'Volunteer or waived credits need a note.' })
            p.note = note
            return send(res, 204)
        }
    }
    m = path.match(/^\/v1\/admin\/fixtures\/([^/]+)\/(availability|lineup)$/)
    if (m) {
        const id = decodeURIComponent(m[1])
        if (m[2] === 'availability' && method === 'GET') {
            const r = roster(id)
            return send(res, 200, { fixtureId: id, counts: countOf(r), members: r })
        }
        if (!fixtureDate(id)) return send(res, 404, { error: 'not_found' })
        if (m[2] === 'lineup' && method === 'GET') return send(res, 200, lineupShape(id, false))
        if (m[2] === 'lineup' && method === 'PUT') {
            const slots = (Array.isArray(body.slots) ? body.slots : []).filter(s => typeof s?.subject === 'string' && s.subject.trim()).map(s => ({ number: s.number, subject: s.subject.trim() }))
            const numbers = slots.map(s => s.number)
            if (slots.some(s => !Number.isInteger(s.number) || s.number < 1 || s.number > 23) || new Set(numbers).size !== numbers.length || new Set(slots.map(s => s.subject)).size !== slots.length) {
                return send(res, 400, { error: 'Numbers run 1 to 23, each used once, and each player at most once.' })
            }
            const emails = slots.map(s => playerOf(s.subject))
            if (emails.some(e => !e)) return send(res, 400, { error: 'Everyone in a lineup must be a club member who has signed in.' })
            const prev = lineups.get(id)
            const publish = body.publish === true
            if (publish && prev?.status !== 'published' && !prev?.notified) console.log(`>> lineup published for ${id}: would notify ${emails.length} players`)
            lineups.set(id, {
                status: publish ? 'published' : 'draft',
                publishedAt: publish ? prev?.publishedAt ?? new Date().toISOString() : null,
                updatedAt: new Date().toISOString(),
                notified: prev?.notified || publish,
                slots: slots.map((s, i) => ({ number: s.number, email: emails[i] })).sort((a, b) => a.number - b.number),
            })
            return send(res, 200, lineupShape(id, false))
        }
    }
    if (method === 'GET' && path === '/v1/admin/invite-links') return send(res, 200, inviteLinks.map(linkShape).reverse())
    if (method === 'POST' && path === '/v1/admin/invite-links') {
        const days = body.expiresInDays ?? 30
        if (!(days >= 1 && days <= 90)) return send(res, 400, { error: 'A link lasts 1 to 90 days.' })
        const link = { id: randomUUID(), token: randomBytes(16).toString('base64url'), createdBy: user.email, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 86400000).toISOString(), revokedAt: null, uses: 0 }
        inviteLinks.push(link)
        return send(res, 201, linkShape(link))
    }
    m = path.match(/^\/v1\/admin\/invite-links\/([^/]+)$/)
    if (m && method === 'DELETE') {
        const link = inviteLinks.find(l => l.id === m[1])
        if (!link) return send(res, 404, { error: 'not_found' })
        link.revokedAt ??= new Date().toISOString()
        return send(res, 204)
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
