import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    centsToDollarsInput,
    duesWriteOutcome,
    isIsoDate,
    mapWithConcurrency,
    memberLabel,
    parseAssignDuesForm,
    parsePositiveDollars,
    parseRecordPaymentForm,
    paymentMethodLabel,
    recordableCents,
    sortMembers,
} from './admin-dues'
import { ClaymoresApiClient, UNREACHABLE, type ApiResult, type FetchLike } from './api-client'

const form = (v: Record<string, string>) => ({ get: (k: string) => v[k] ?? null })
const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const fail = (status: number, error: string | null = null): ApiResult<unknown> => ({ ok: false, status, error, body: null })

test('parses admin dollar amounts into cents and rejects zero, negatives, and extra decimals', () => {
    assert.deepEqual(parsePositiveDollars('150'), { ok: true, cents: 15000 })
    assert.deepEqual(parsePositiveDollars('$1,025.5'), { ok: true, cents: 102550 })
    assert.deepEqual(parsePositiveDollars(' 0.01 '), { ok: true, cents: 1 })
    assert.deepEqual(parsePositiveDollars('19.99'), { ok: true, cents: 1999 }) // no float drift
    for (const bad of ['0', '0.00', '-5', '1.234', 'abc', '', '1e3', '.5', '100000.01']) {
        assert.equal(parsePositiveDollars(bad).ok, false, bad)
    }
    assert.deepEqual(parsePositiveDollars('100000'), { ok: true, cents: 10_000_000 })
})

test('formats cents for the amount input and computes what can still be recorded', () => {
    assert.equal(centsToDollarsInput(2550), '25.50')
    assert.equal(centsToDollarsInput(-5), '0.00')
    assert.equal(recordableCents({ balanceCents: 15000, pendingCheckoutCents: 5000 }), 10000)
    assert.equal(recordableCents({ balanceCents: 5000, pendingCheckoutCents: 5000 }), 0)
    assert.equal(recordableCents({ balanceCents: -100, pendingCheckoutCents: 0 }), 0)
})

test('labels payment methods and members', () => {
    assert.equal(paymentMethodLabel('stripe'), 'Card (Stripe)')
    assert.equal(paymentMethodLabel('cash'), 'Cash')
    assert.equal(paymentMethodLabel('zelle'), 'Zelle')
    assert.equal(paymentMethodLabel('something-new'), 'Other')
    assert.equal(paymentMethodLabel(null), null)
    assert.equal(paymentMethodLabel(undefined), null)

    assert.equal(memberLabel({ name: 'Pat Player', email: 'pat@example.com' }), 'Pat Player (pat@example.com)')
    assert.equal(memberLabel({ name: '  ', email: 'pat@example.com' }), 'pat@example.com')
    assert.equal(memberLabel({ name: null, email: 'pat@example.com' }), 'pat@example.com')
    assert.deepEqual(
        sortMembers([
            { name: 'zed', email: 'z@x.com' },
            { name: null, email: 'b@x.com' },
            { name: 'Al', email: 'a@x.com' },
        ]).map(m => m.email),
        ['a@x.com', 'b@x.com', 'z@x.com'],
    )
})

test('validates calendar dates', () => {
    assert.equal(isIsoDate('2026-12-01'), true)
    assert.equal(isIsoDate('2028-02-29'), true)
    assert.equal(isIsoDate('2026-02-29'), false)
    assert.equal(isIsoDate('2026-13-01'), false)
    assert.equal(isIsoDate('12/01/2026'), false)
})

test('parses the assign-dues form', () => {
    const ok = parseAssignDuesForm(form({ id: ID, playerSubject: 'sub-1', description: ' Season dues ', amount: '150', dueDate: '' }))
    assert.deepEqual(ok.ok && ok.value, { id: ID, playerSubject: 'sub-1', description: 'Season dues', amountCents: 15000 })

    const dated = parseAssignDuesForm(form({ id: ID.toUpperCase(), playerSubject: 'sub-1', description: 'Kit', amount: '40.5', dueDate: '2027-01-15' }))
    assert.deepEqual(dated.ok && dated.value, { id: ID, playerSubject: 'sub-1', description: 'Kit', amountCents: 4050, dueDate: '2027-01-15' })

    const cases: Record<string, string>[] = [
        { id: 'not-a-uuid', playerSubject: 'sub-1', description: 'Dues', amount: '10' },
        { id: ID, playerSubject: '', description: 'Dues', amount: '10' },
        { id: ID, playerSubject: 'sub-1', description: '', amount: '10' },
        { id: ID, playerSubject: 'sub-1', description: 'x'.repeat(121), amount: '10' },
        { id: ID, playerSubject: 'sub-1', description: 'Dues', amount: '0' },
        { id: ID, playerSubject: 'sub-1', description: 'Dues', amount: '10.001' },
        { id: ID, playerSubject: 'sub-1', description: 'Dues', amount: '10', dueDate: '2026-02-30' },
    ]
    for (const c of cases) {
        const r = parseAssignDuesForm(form(c))
        assert.equal(r.ok, false, JSON.stringify(c))
        // Values are echoed back so the form keeps what was typed.
        assert.equal(r.values.amount, (c.amount ?? '').trim())
    }
    assert.equal(parseAssignDuesForm(form({ id: ID, playerSubject: 'sub-1', description: 'x'.repeat(120), amount: '1' })).ok, true)
})

test('parses the record-payment form', () => {
    const ok = parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '25', method: 'venmo', note: ' @pat ' }))
    assert.deepEqual(ok.ok && ok.value, { assessmentId: 'a-1', payment: { id: ID, amountCents: 2500, method: 'venmo', note: '@pat' } })

    const noNote = parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '25', method: 'cash', note: '' }))
    assert.deepEqual(noNote.ok && noNote.value.payment, { id: ID, amountCents: 2500, method: 'cash' })

    assert.equal(parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '25', method: 'stripe' })).ok, false)
    assert.equal(parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '-1', method: 'cash' })).ok, false)
    assert.equal(parseRecordPaymentForm(form({ id: ID, assessmentId: '', amount: '1', method: 'cash' })).ok, false)
    assert.equal(parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '1', method: 'cash', note: 'n'.repeat(501) })).ok, false)
    assert.equal(parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '1', method: 'cash', note: 'n'.repeat(500) })).ok, true)
})

test('maps dues write results: API sentences shown, ambiguous failures keep the idempotency id', () => {
    assert.deepEqual(duesWriteOutcome({ ok: true, status: 201, data: null }, 'assign'), { kind: 'ok' })
    assert.deepEqual(duesWriteOutcome(fail(401), 'payment'), { kind: 'sign-in' })

    const conflict = duesWriteOutcome(fail(409, 'Payment exceeds the available balance after any pending checkout.'), 'payment')
    assert.deepEqual(conflict, { kind: 'error', message: 'Payment exceeds the available balance after any pending checkout.', retry: false })

    const coded = duesWriteOutcome(fail(400, 'invalid_amount'), 'assign')
    assert.equal(coded.kind === 'error' && coded.message, 'Check the details and try again.')

    const switchedOff = duesWriteOutcome(fail(404), 'assign')
    assert.equal(switchedOff.kind === 'error' && switchedOff.message, 'Dues are switched off on the club server.')

    for (const status of [UNREACHABLE, 500, 502, 503]) {
        const r = duesWriteOutcome(fail(status), 'payment')
        assert.equal(r.kind === 'error' && r.retry, true, String(status))
    }
    for (const status of [400, 403, 404, 409]) {
        const r = duesWriteOutcome(fail(status), 'payment')
        assert.equal(r.kind === 'error' && r.retry, false, String(status))
    }
})

test('maps with bounded concurrency and keeps order', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 3, async (n, i) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise(r => setTimeout(r, n))
        inFlight--
        return `${i}:${n}`
    })
    assert.deepEqual(out, ['0:5', '1:1', '2:4', '3:2', '4:3', '5:0', '6:6'])
    assert.ok(peak <= 3)
    assert.deepEqual(await mapWithConcurrency([], 3, async () => 1), [])
})

test('admin dues client calls hit the contract routes with the given bodies', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = []
    const fetch: FetchLike = async (url, init) => {
        calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return new Response('[]', { status: 200 })
    }
    const api = new ClaymoresApiClient({ baseUrl: 'https://api.example.com', fetch }).withAccessToken('t')
    await api.members()
    await api.allDues()
    await api.duesDetail('a/1')
    await api.createDues({ id: ID, playerSubject: 's', description: 'Season dues', amountCents: 15000 })
    await api.recordDuesPayment('a-1', { id: ID, amountCents: 2500, method: 'cash', note: 'at practice' })
    assert.deepEqual(calls, [
        { url: 'https://api.example.com/v1/admin/members', method: 'GET', body: undefined },
        { url: 'https://api.example.com/v1/admin/dues', method: 'GET', body: undefined },
        { url: 'https://api.example.com/v1/admin/dues/a%2F1', method: 'GET', body: undefined },
        { url: 'https://api.example.com/v1/admin/dues', method: 'POST', body: { id: ID, playerSubject: 's', description: 'Season dues', amountCents: 15000 } },
        { url: 'https://api.example.com/v1/admin/dues/a-1/payments', method: 'POST', body: { id: ID, amountCents: 2500, method: 'cash', note: 'at practice' } },
    ])
})

test('assigning to everyone: summary text and the skip checkbox', async () => {
    const { allMembersSummary, parseAssignDuesForm, ALL_MEMBERS } = await import('./admin-dues')
    assert.equal(allMembersSummary({ created: 12, skipped: 0 }, '$100.00', 'Season dues'), 'Assigned $100.00 “Season dues” to 12 members.')
    assert.equal(allMembersSummary({ created: 1, skipped: 2 }, '$100.00', 'Season dues'),
        'Assigned $100.00 “Season dues” to 1 member; skipped 2 members who already had it.')
    assert.equal(allMembersSummary({ created: 0, skipped: 3 }, '$100.00', 'Season dues'),
        'Nobody new to assign “Season dues” to; skipped 3 members who already had it.')

    const form = (entries: Record<string, string>) => ({ get: (k: string) => entries[k] ?? null })
    const base = { id: '11111111-1111-4111-8111-111111111111', playerSubject: ALL_MEMBERS, description: 'Season dues', amount: '100' }
    const checked = parseAssignDuesForm(form({ ...base, skipExisting: 'on' }))
    assert.ok(checked.ok)
    assert.equal(checked.values.skipExisting, true)
    assert.equal(checked.ok && checked.value.playerSubject, ALL_MEMBERS)
    const unchecked = parseAssignDuesForm(form(base))
    assert.equal(unchecked.values.skipExisting, false)
})
