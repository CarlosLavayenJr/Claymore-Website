import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deletionOutcome, isDeleteConfirmed } from './account-deletion'
import { ClaymoresApiClient, type FetchLike } from './api-client'

test('deleteMe sends DELETE /v1/me with the bearer token', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetch: FetchLike = async (url, init) => {
        calls.push({ url, init })
        return new Response(null, { status: 204 })
    }
    const result = await new ClaymoresApiClient({ baseUrl: 'https://api', accessToken: 'tok', fetch }).deleteMe()
    assert.equal(result.ok, true)
    assert.equal(calls[0].url, 'https://api/v1/me')
    assert.equal(calls[0].init?.method, 'DELETE')
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer tok')
})

test('deletion needs the exact confirmation word', () => {
    assert.equal(isDeleteConfirmed('DELETE'), true)
    assert.equal(isDeleteConfirmed(' DELETE '), true)
    assert.equal(isDeleteConfirmed('delete'), false)
    assert.equal(isDeleteConfirmed(''), false)
    assert.equal(isDeleteConfirmed(null), false)
})

test('maps DELETE /v1/me results', () => {
    assert.deepEqual(deletionOutcome({ ok: true, status: 204, data: null }), { kind: 'deleted' })
    assert.deepEqual(deletionOutcome({ ok: false, status: 401, error: 'invalid_token', body: null }), { kind: 'sign-in' })

    const lastAdmin = deletionOutcome({ ok: false, status: 409, error: 'last_admin', body: { error: 'last_admin' } })
    assert.equal(lastAdmin.kind, 'error')
    assert.match(lastAdmin.kind === 'error' ? lastAdmin.message : '', /only admin/)

    for (const status of [0, 404, 500, 502]) {
        const outcome = deletionOutcome({ ok: false, status, error: null, body: null })
        assert.equal(outcome.kind, 'error', `status ${status} must not count as deleted`)
    }
})
