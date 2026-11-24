import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiUnavailableError, fetchApiJson, sportsDataSource, withSanityFallback } from './data-source'

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('sports data defaults to Sanity; API needs CLAYMORES_DATA_SOURCE=api and a URL', () => {
    assert.equal(sportsDataSource({}), 'sanity')
    // Setting the API URL for member sign-in alone must not move public data.
    assert.equal(sportsDataSource({ CLAYMORES_API_BASE_URL: 'https://api' }), 'sanity')
    assert.equal(sportsDataSource({ CLAYMORES_API_BASE_URL: 'https://api', CLAYMORES_DATA_SOURCE: 'sanity' }), 'sanity')
    assert.equal(sportsDataSource({ CLAYMORES_API_BASE_URL: 'https://api', CLAYMORES_DATA_SOURCE: 'API ' }), 'api')
    assert.equal(sportsDataSource({ CLAYMORES_DATA_SOURCE: 'api' }), 'sanity')
    assert.equal(sportsDataSource({ CLAYMORES_API_BASE_URL: 'https://api', CLAYMORES_DATA_SOURCE: 'bogus' }), 'sanity')
})

test('fetchApiJson returns data, null for allowed 404s, and passes a timeout signal', async () => {
    let init: RequestInit | undefined
    const ok = await fetchApiJson<number[]>('https://api/v1/teams', {
        fetch: async (_url, i) => { init = i; return json(200, [1]) },
    })
    assert.deepEqual(ok, [1])
    assert.ok(init?.signal instanceof AbortSignal)
    assert.equal(await fetchApiJson('https://api/v1/players/x', { fetch: async () => json(404, {}), allowMissing: true }), null)
})

test('fetchApiJson marks network errors, timeouts, 5xx and bad bodies as unavailable', async () => {
    const unavailable = [
        () => fetchApiJson('https://api/v1/teams', { fetch: async () => { throw new TypeError('fetch failed') } }),
        () => fetchApiJson('https://api/v1/teams', { fetch: async () => json(503, {}) }),
        () => fetchApiJson('https://api/v1/teams', { fetch: async () => new Response('<html>', { status: 200 }) }),
        () => fetchApiJson('https://api/v1/teams', {
            timeoutMs: 10,
            fetch: (_url, init) => new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
            }),
        }),
    ]
    for (const call of unavailable) await assert.rejects(call, ApiUnavailableError)

    // A 4xx is a real contract problem, not an outage: it is not swallowed.
    await assert.rejects(
        fetchApiJson('https://api/v1/teams', { fetch: async () => json(400, {}) }),
        error => !(error instanceof ApiUnavailableError),
    )
})

test('withSanityFallback reads Sanity and warns only when the API is unavailable', async () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)

    assert.equal(await withSanityFallback('teams', async () => 'api', async () => 'sanity', warn), 'api')
    assert.equal(warnings.length, 0)

    const fallback = await withSanityFallback(
        'teams',
        async () => { throw new ApiUnavailableError('GET /v1/teams returned 502') },
        async () => 'sanity',
        warn,
    )
    assert.equal(fallback, 'sanity')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /teams.*502.*Sanity/)

    await assert.rejects(
        withSanityFallback('teams', async () => { throw new Error('bug') }, async () => 'sanity', warn),
        /bug/,
    )
})
