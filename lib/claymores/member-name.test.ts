import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsFullName, parseNameForm, splitName } from './member-name'

function form(values: Record<string, string>) {
    const data = new FormData()
    for (const [k, v] of Object.entries(values)) data.set(k, v)
    return data
}

test('a single word, a blank or an email needs a full name', () => {
    assert.equal(needsFullName('Anthony'), true)
    assert.equal(needsFullName('  '), true)
    assert.equal(needsFullName(null), true)
    assert.equal(needsFullName('anthony@example.com'), true)
    assert.equal(needsFullName('Anthony Rossi'), false)
    assert.equal(needsFullName(' Anthony   Rossi '), false)
})

test('names split into first and the rest', () => {
    assert.deepEqual(splitName('Anthony'), { first: 'Anthony', last: '' })
    assert.deepEqual(splitName('Mary Ann  de la Cruz'), { first: 'Mary', last: 'Ann de la Cruz' })
    assert.deepEqual(splitName('x@example.com'), { first: '', last: '' })
})

test('the name form needs both parts and joins them', () => {
    assert.deepEqual(parseNameForm(form({ first: ' Anthony ', last: ' Rossi ' })), { ok: true, name: 'Anthony Rossi' })
    assert.equal(parseNameForm(form({ first: 'Anthony', last: ' ' })).ok, false)
    assert.equal(parseNameForm(form({ first: 'A'.repeat(50), last: 'B'.repeat(40) })).ok, false)
})
