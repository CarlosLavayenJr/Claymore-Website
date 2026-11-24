import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ClaymoresApiClient, parseDollarsToCents, type FetchLike } from './api-client'
import { createRefresher, exchangeGoogleIdToken, needsRefresh, toApiSession } from './api-session'
import { devSignInEnabled, memberAuthEnabled, webCheckoutEnabled } from './auth-env'
import { CHECKOUT_UNAVAILABLE_MESSAGE, checkoutOutcome, checkoutReturnStatus } from './checkout'
import { validateJoinRequest } from './join-request'
import { findSessionCookie } from './session-cookie'

type Call = { url: string; init?: RequestInit }

function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = []
    const fetch: FetchLike = async (url, init) => {
        const call = { url, init }
        calls.push(call)
        return handler(call)
    }
    return { fetch, calls }
}

const json = (status: number, body: unknown) =>
    new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const tokens = (n: number, expiresAt = '2026-11-24T18:00:00+00:00') => ({
    accessToken: `access-${n}`,
    accessTokenExpiresAt: expiresAt,
    refreshToken: `refresh-${n}`,
    user: { subject: 'sub-1', name: 'Pat Player', email: 'pat@example.com', role: 'player' },
})

test('client sends JSON with bearer token and strips trailing slashes', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { subject: 's', name: 'n', email: 'e', role: 'admin' }))
    const api = new ClaymoresApiClient({ baseUrl: 'https://api.example.com///', fetch }).withAccessToken('abc')
    const result = await api.me()
    assert.equal(result.ok, true)
    assert.equal(calls[0].url, 'https://api.example.com/v1/me')
    const headers = calls[0].init?.headers as Record<string, string>
    assert.equal(headers.Authorization, 'Bearer abc')
    assert.equal(calls[0].init?.cache, 'no-store')
})

test('client encodes path segments and posts bodies', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { email: 'a+b@x.com', role: 'player' }))
    const api = new ClaymoresApiClient({ baseUrl: 'https://api', fetch, accessToken: 't' })
    await api.putInvitation('a+b@x.com', 'player')
    assert.equal(calls[0].url, 'https://api/v1/admin/invitations/a%2Bb%40x.com')
    assert.equal(calls[0].init?.method, 'PUT')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { role: 'player' })
})

test('client reports API errors, fields, and status-style errors', async () => {
    const api = (body: unknown, status: number) =>
        new ClaymoresApiClient({ baseUrl: 'https://api', fetch: fakeFetch(() => json(status, body)).fetch })
    const invalid = await api({ error: 'invalid_request', field: 'phone' }, 400).requestAccess({ idToken: 't', name: 'n' })
    assert.deepEqual([invalid.ok, invalid.status, !invalid.ok && invalid.error, !invalid.ok && invalid.field], [false, 400, 'invalid_request', 'phone'])
    const member = await api({ status: 'already_member' }, 409).requestAccess({ idToken: 't', name: 'n' })
    assert.equal(!member.ok && member.error, 'already_member')
    const denied = await api({ status: 'denied_recently' }, 429).requestAccess({ idToken: 't', name: 'n' })
    assert.equal(!denied.ok && denied.error, 'denied_recently')
    const limited = await api({ error: 'rate_limited' }, 429).requestAccess({ idToken: 't', name: 'n' })
    assert.equal(!limited.ok && limited.error, 'rate_limited')
})

test('client turns network failures into status 0', async () => {
    const api = new ClaymoresApiClient({ baseUrl: 'https://api', fetch: async () => { throw new TypeError('fetch failed') } })
    const result = await api.myDues()
    assert.deepEqual(result, { ok: false, status: 0, error: 'unreachable', body: null })
})

test('client handles 204 empty bodies', async () => {
    const api = new ClaymoresApiClient({ baseUrl: 'https://api', fetch: async () => new Response(null, { status: 204 }) })
    const result = await api.logout('r')
    assert.deepEqual(result, { ok: true, status: 204, data: null })
})

test('exchange maps the API contract to outcomes', async () => {
    const outcome = async (status: number, body: unknown) =>
        exchangeGoogleIdToken(new ClaymoresApiClient({ baseUrl: 'https://api', fetch: fakeFetch(() => json(status, body)).fetch }), 'id')
    const ok = await outcome(200, tokens(1))
    assert.equal(ok.kind, 'signed-in')
    assert.equal(ok.kind === 'signed-in' && ok.session.accessTokenExpiresAt, Date.parse('2026-11-24T18:00:00Z'))
    assert.equal((await outcome(403, { error: 'not_invited' })).kind, 'not-invited')
    assert.equal((await outcome(401, { error: 'invalid_token' })).kind, 'invalid')
    assert.equal((await outcome(503, null)).kind, 'unavailable')
    assert.equal((await outcome(200, { accessToken: 'x' })).kind, 'unavailable')
})

test('exchange posts the id token to the mobile Google endpoint', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, tokens(1)))
    await exchangeGoogleIdToken(new ClaymoresApiClient({ baseUrl: 'https://api', fetch }), 'google-id-token')
    assert.equal(calls[0].url, 'https://api/v1/auth/mobile/google')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { idToken: 'google-id-token' })
})

test('needsRefresh uses a two minute skew', () => {
    const now = Date.parse('2026-11-24T17:00:00Z')
    assert.equal(needsRefresh({ accessTokenExpiresAt: now + 3 * 60_000 }, now), false)
    assert.equal(needsRefresh({ accessTokenExpiresAt: now + 60_000 }, now), true)
    assert.equal(needsRefresh({ accessTokenExpiresAt: now - 1 }, now), true)
})

test('refresh is single-flight: parallel callers share one rotation', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const { fetch, calls } = fakeFetch(async () => { await gate; return json(200, tokens(2)) })
    const refresher = createRefresher(new ClaymoresApiClient({ baseUrl: 'https://api', fetch }))
    const all = Promise.all([refresher.refresh('refresh-1'), refresher.refresh('refresh-1'), refresher.refresh('refresh-1')])
    release()
    const outcomes = await all
    assert.equal(calls.length, 1)
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { refreshToken: 'refresh-1' })
    for (const o of outcomes) assert.equal(o.kind === 'refreshed' && o.session.refreshToken, 'refresh-2')
})

test('refresh remembers a rotation so a late request with the old token is not replayed', async () => {
    let t = 0
    const { fetch, calls } = fakeFetch(() => json(200, tokens(calls.length + 1)))
    const refresher = createRefresher(new ClaymoresApiClient({ baseUrl: 'https://api', fetch }), { rememberMs: 1000, now: () => t })
    const first = await refresher.refresh('refresh-1')
    t = 500
    const late = await refresher.refresh('refresh-1')
    assert.equal(calls.length, 1)
    assert.deepEqual(late, first)
    t = 2000
    await refresher.refresh('refresh-1')
    assert.equal(calls.length, 2)
})

test('refresh distinguishes revoked from unavailable and retries unavailable', async () => {
    let status = 503
    const { fetch, calls } = fakeFetch(() => json(status, status === 401 ? { error: 'invalid_token' } : null))
    const refresher = createRefresher(new ClaymoresApiClient({ baseUrl: 'https://api', fetch }))
    assert.equal((await refresher.refresh('r')).kind, 'unavailable')
    assert.equal((await refresher.refresh('r')).kind, 'unavailable')
    assert.equal(calls.length, 2)
    status = 401
    assert.equal((await refresher.refresh('r')).kind, 'revoked')
    status = 403
    assert.equal((await refresher.refresh('other')).kind, 'revoked')
    assert.deepEqual(refresher.size(), { inFlight: 0, recent: 2 })
})

test('toApiSession rejects incomplete responses', () => {
    assert.throws(() => toApiSession({ ...tokens(1), accessTokenExpiresAt: 'not a date' }))
    assert.throws(() => toApiSession({ ...tokens(1), refreshToken: '' }))
})

test('feature gate needs all four env vars; dev sign-in only in development', () => {
    const env = { AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 's', AUTH_SECRET: 'x', CLAYMORES_API_BASE_URL: 'https://api' }
    assert.equal(memberAuthEnabled(env), true)
    assert.equal(memberAuthEnabled({ ...env, AUTH_SECRET: ' ' }), false)
    assert.equal(memberAuthEnabled({}), false)
    assert.equal(devSignInEnabled({ ...env, NODE_ENV: 'development', CLAYMORES_DEV_SIGN_IN: '1' }), true)
    assert.equal(devSignInEnabled({ ...env, NODE_ENV: 'production', CLAYMORES_DEV_SIGN_IN: '1' }), false)
})

test('finds plain, secure, and chunked session cookies', () => {
    const jar = (cookies: Record<string, string>) => ({ getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })) })
    assert.deepEqual(findSessionCookie(jar({ 'authjs.session-token': 'a' })), { name: 'authjs.session-token', secure: false, value: 'a' })
    assert.deepEqual(findSessionCookie(jar({ '__Secure-authjs.session-token.1': 'b', '__Secure-authjs.session-token.0': 'a' })), {
        name: '__Secure-authjs.session-token', secure: true, value: 'ab',
    })
    assert.equal(findSessionCookie(jar({ other: 'x' })), null)
})

test('parses dollar amounts to cents', () => {
    assert.equal(parseDollarsToCents('25'), 2500)
    assert.equal(parseDollarsToCents('$1,025.5'), 102550)
    assert.equal(parseDollarsToCents('0.07'), 7)
    assert.equal(parseDollarsToCents('1.234'), null)
    assert.equal(parseDollarsToCents('-5'), null)
    assert.equal(parseDollarsToCents('abc'), null)
})

test('validates the request-to-join form', () => {
    const form = (v: Record<string, string>) => ({ get: (k: string) => v[k] ?? null })
    assert.deepEqual(validateJoinRequest(form({ name: ' Pat ', phone: '', message: '' })), {
        ok: true, values: { name: 'Pat', phone: '', message: '' }, value: { name: 'Pat' },
    })
    const bad = validateJoinRequest(form({ name: 'Pat', phone: 'call me' }))
    assert.equal(!bad.ok && bad.field, 'phone')
    const missing = validateJoinRequest(form({ name: '  ' }))
    assert.equal(!missing.ok && missing.field, 'name')
    const ok = validateJoinRequest(form({ name: 'Pat', phone: '(407) 555-0100', message: 'Flanker, 3 seasons' }))
    assert.deepEqual(ok.ok && ok.value, { name: 'Pat', phone: '(407) 555-0100', message: 'Flanker, 3 seasons' })
})

test('checkout asks the API to return to the website', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { url: 'https://checkout.stripe.com/c/pay/x' }))
    const api = new ClaymoresApiClient({ baseUrl: 'https://api', fetch, accessToken: 't' })
    const result = await api.createCheckoutSession('a/b', 2550)
    assert.equal(calls[0].url, 'https://api/v1/dues/a%2Fb/checkout-session')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { amountCents: 2550, returnTo: 'web' })
    assert.deepEqual(checkoutOutcome(result), { kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/x' })
    await api.createCheckoutSession('a', 100, 'app')
    assert.equal(JSON.parse(String(calls[1].init?.body)).returnTo, 'app')
})

test('checkout maps API errors to member messages', async () => {
    const outcome = async (status: number, body: unknown) => {
        const api = new ClaymoresApiClient({ baseUrl: 'https://api', fetch: fakeFetch(() => json(status, body)).fetch })
        return checkoutOutcome(await api.createCheckoutSession('a', 100))
    }
    assert.deepEqual(await outcome(400, { error: 'web_checkout_unavailable' }), { kind: 'error', message: CHECKOUT_UNAVAILABLE_MESSAGE })
    const invalid = await outcome(400, { error: 'invalid_request', field: 'amountCents' })
    assert.match(invalid.kind === 'error' ? invalid.message : '', /\$0\.50/)
    assert.deepEqual(await outcome(401, { error: 'invalid_token' }), { kind: 'sign-in' })
    assert.match((await outcome(404, { error: 'not_found' }) as { message: string }).message, /wasn’t found/)
    assert.match((await outcome(409, { error: 'overpayment' }) as { message: string }).message, /already in progress/)
    assert.match((await outcome(502, { title: 'Stripe' }) as { message: string }).message, /Stripe couldn’t start/)
    assert.match((await outcome(500, null) as { message: string }).message, /temporarily unavailable/)
    // A 200 without an https URL is never followed.
    assert.equal((await outcome(200, { url: 'javascript:alert(1)' })).kind, 'error')
})

test('reads the checkout return banner and the web checkout kill switch', () => {
    assert.equal(checkoutReturnStatus('returned'), 'returned')
    assert.equal(checkoutReturnStatus(['cancelled', 'returned']), 'cancelled')
    assert.equal(checkoutReturnStatus('paid'), null)
    assert.equal(checkoutReturnStatus(undefined), null)
    assert.equal(webCheckoutEnabled({}), false)
    assert.equal(webCheckoutEnabled({ CLAYMORES_WEB_CHECKOUT_ENABLED: 'true' }), true)
})
