import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeCallbackUrl } from './callback-url'

// Next.js hands pages the decoded query value, so decode like it does.
const fromQuery = (raw: string) => decodeURIComponent(raw)

test('rejects open-redirect callback URLs', () => {
    const rejected = [
        fromQuery('%2F%09%2Fevil.com'), // "/\t/evil.com": browsers strip the tab -> //evil.com
        fromQuery('/%0a/evil.com'),
        fromQuery('/%0d%0a/evil.com'),
        fromQuery('/%00/evil.com'),
        fromQuery('/%7f/evil.com'),
        '/\\evil.com',
        '/\\/evil.com',
        'https://evil.com',
        '//evil.com',
        '/.//evil.com',
        '/../..//evil.com',
        'evil.com',
        'javascript:alert(1)',
        '',
        undefined,
        null,
        42,
    ]
    for (const value of rejected) assert.equal(safeCallbackUrl(value), '/account', JSON.stringify(value))
})

test('keeps same-origin paths, query and hash', () => {
    assert.equal(safeCallbackUrl('/account'), '/account')
    assert.equal(safeCallbackUrl('/account?x=1#y'), '/account?x=1#y')
    assert.equal(safeCallbackUrl('/account/admin'), '/account/admin')
    assert.equal(safeCallbackUrl('/%2F%2Fevil.com'), '/%2F%2Fevil.com') // still a path on this site
    assert.equal(safeCallbackUrl('//evil.com', '/'), '/')
})
