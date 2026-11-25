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
    summarizeDues,
    formatSummaryCents,
    creditedCentsOf,
    duesMoneyLine,
    duesSummaryTotals,
    isCreditMethod,
    MANUAL_PAYMENT_METHODS,
    notePlaceholder,
    noteRequiredMessage,
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
    assert.equal(paymentMethodLabel('volunteer'), 'Volunteered')
    assert.equal(paymentMethodLabel('waived'), 'Waived')
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

test('parses the automatic-dues form', async () => {
    const { parseAutomaticDuesForm } = await import('./admin-dues')
    const on = parseAutomaticDuesForm(form({ enabled: 'on', description: ' Season dues ', amount: '150', dueDate: '2027-01-15', savedAmountCents: '0' }))
    assert.deepEqual(on.ok && on.value, { enabled: true, description: 'Season dues', amountCents: 15000, dueDate: '2027-01-15' })

    const noDate = parseAutomaticDuesForm(form({ enabled: 'on', description: 'Kit', amount: '$40.50', dueDate: '' }))
    assert.deepEqual(noDate.ok && noDate.value, { enabled: true, description: 'Kit', amountCents: 4050, dueDate: null })

    // While on, the amount and description are required and validated like the assign form.
    const onCases: Record<string, string>[] = [
        { enabled: 'on', description: 'Dues', amount: '' },
        { enabled: 'on', description: 'Dues', amount: '0' },
        { enabled: 'on', description: 'Dues', amount: '10.001' },
        { enabled: 'on', description: '', amount: '10' },
        { enabled: 'on', description: 'x'.repeat(121), amount: '10' },
        { enabled: 'on', description: 'Dues', amount: '10', dueDate: '2026-02-30' },
    ]
    for (const c of onCases) {
        const r = parseAutomaticDuesForm(form({ savedAmountCents: '15000', ...c }))
        assert.equal(r.ok, false, JSON.stringify(c))
        assert.equal(r.values.amount, c.amount)
        assert.equal(r.values.enabled, true)
    }

    // Switching off with the amount blank keeps the last saved amount (and description), so it never fails.
    const off = parseAutomaticDuesForm(form({ description: '', amount: '', dueDate: '', savedAmountCents: '15000', savedDescription: 'Season dues' }))
    assert.deepEqual(off.ok && off.value, { enabled: false, description: 'Season dues', amountCents: 15000, dueDate: null })
    const offTyped = parseAutomaticDuesForm(form({ description: 'Kit', amount: '20', savedAmountCents: '15000' }))
    assert.deepEqual(offTyped.ok && offTyped.value, { enabled: false, description: 'Kit', amountCents: 2000, dueDate: null })
    const offNoSavedDescription = parseAutomaticDuesForm(form({ amount: '', savedAmountCents: '500' }))
    assert.equal(offNoSavedDescription.ok && offNoSavedDescription.value?.description, 'Season dues')

    // Never set up (saved 0) and left off with no amount: nothing to send.
    for (const saved of ['0', '', 'abc', '-5', '1.5']) {
        const nothing = parseAutomaticDuesForm(form({ description: 'Season dues', amount: '', savedAmountCents: saved }))
        assert.equal(nothing.ok, true, saved)
        assert.equal(nothing.ok && nothing.value, null, saved)
    }
    // A typed amount that's invalid still fails while off: it's what the admin entered.
    assert.equal(parseAutomaticDuesForm(form({ description: 'Dues', amount: 'abc', savedAmountCents: '15000' })).ok, false)
})

test('automatic dues: normalizing the API setting, summary text, and which dues can be removed', async () => {
    const { normalizeAutomaticDues, automaticDuesSummary, canRemoveDues } = await import('./admin-dues')
    assert.deepEqual(normalizeAutomaticDues({ enabled: false, description: 'Season dues', amountCents: 0, dueDate: null }),
        { enabled: false, description: 'Season dues', amountCents: 0, dueDate: null })
    assert.deepEqual(normalizeAutomaticDues({ enabled: true, description: ' Kit ', amountCents: 4050, dueDate: '2027-01-15' }),
        { enabled: true, description: 'Kit', amountCents: 4050, dueDate: '2027-01-15' })
    assert.deepEqual(normalizeAutomaticDues(null), { enabled: false, description: 'Season dues', amountCents: 0, dueDate: null })
    assert.deepEqual(normalizeAutomaticDues({ enabled: 'yes' as never, description: '', amountCents: 1.5, dueDate: '2027-02-30' }),
        { enabled: false, description: 'Season dues', amountCents: 0, dueDate: null })

    assert.equal(automaticDuesSummary({ enabled: true, description: 'Season dues', amountCents: 15000 }),
        'Automatic dues are on: every player who signs in gets $150.00 “Season dues”.')
    assert.equal(automaticDuesSummary({ enabled: false, description: 'Season dues', amountCents: 15000 }),
        'Automatic dues are off. Nobody new gets dues automatically.')

    assert.equal(canRemoveDues({ paidCents: 0, pendingCheckoutCents: 0 }), true)
    assert.equal(canRemoveDues({ paidCents: 100, pendingCheckoutCents: 0 }), false)
    assert.equal(canRemoveDues({ paidCents: 0, pendingCheckoutCents: 5000 }), false)
})

test('automatic dues and remove: client routes and write outcomes', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = []
    const fetch: FetchLike = async (url, init) => {
        calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response('{}', { status: 200 })
    }
    const api = new ClaymoresApiClient({ baseUrl: 'https://api.example.com', fetch }).withAccessToken('t')
    await api.getAutomaticDues()
    await api.saveAutomaticDues({ enabled: true, description: 'Season dues', amountCents: 15000, dueDate: null })
    const removed = await api.removeDues('a/1')
    assert.deepEqual(removed, { ok: true, status: 204, data: null })
    assert.deepEqual(calls, [
        { url: 'https://api.example.com/v1/admin/dues/automatic', method: 'GET', body: undefined },
        { url: 'https://api.example.com/v1/admin/dues/automatic', method: 'PUT', body: { enabled: true, description: 'Season dues', amountCents: 15000, dueDate: null } },
        { url: 'https://api.example.com/v1/admin/dues/a%2F1', method: 'DELETE', body: undefined },
    ])

    const blocked = duesWriteOutcome(fail(409, 'This item has payments or a card checkout in progress, so it can’t be removed.'), 'remove')
    assert.equal(blocked.kind === 'error' && blocked.message, 'This item has payments or a card checkout in progress, so it can’t be removed.')
    const blockedNoText = duesWriteOutcome(fail(409), 'remove')
    assert.equal(blockedNoText.kind === 'error' && blockedNoText.message, 'This item has payments or a card checkout in progress, so it can’t be removed.')
    const gone = duesWriteOutcome(fail(404), 'remove')
    assert.equal(gone.kind === 'error' && gone.message, 'That dues item wasn’t found. It may already have been removed. Refresh the page.')
    const off = duesWriteOutcome(fail(404), 'automatic')
    assert.equal(off.kind === 'error' && off.message, 'Dues are switched off on the club server.')
    const invalid = duesWriteOutcome(fail(400, 'Description must be 1-120 characters.'), 'automatic')
    assert.equal(invalid.kind === 'error' && invalid.message, 'Description must be 1-120 characters.')
    const down = duesWriteOutcome(fail(503), 'remove')
    assert.equal(down.kind === 'error' && down.message, 'The club server didn’t respond. Try again in a minute.')
})

const dues = (playerSubject: string, description: string, amountCents: number, paidCents: number, pendingCheckoutCents = 0, creditedCents?: number) => ({
    playerSubject, description, amountCents, paidCents, balanceCents: amountCents - paidCents, pendingCheckoutCents,
    ...(creditedCents === undefined ? {} : { creditedCents }),
})
const names = new Map([['a', 'Alice'], ['b', 'bob'], ['c', 'Cara'], ['d', 'Dan']])

test('summarizeDues: empty input gives no groups', () => {
    assert.deepEqual(summarizeDues([], names), [])
})

test('summarizeDues: groups by description, counts each status, and sorts names', () => {
    const [season, ...rest] = summarizeDues([
        dues('c', '2026-27 Season dues', 12500, 0),
        dues('a', '2026-27 Season dues', 12500, 12500),
        dues('b', '2026-27 Season dues', 12500, 5000, 2500),
        dues('d', '2026-27 Season dues', 12500, 0),
        dues('x', '2026-27 Season dues', 12500, 13000), // overpaid, former member
    ], names)
    assert.equal(rest.length, 0)
    assert.equal(season.description, '2026-27 Season dues')
    assert.equal(season.amountCents, 12500)
    assert.equal(season.count, 5)
    assert.deepEqual([season.paidInFull, season.partlyPaid, season.unpaid], [2, 1, 2])
    assert.equal(season.totalCents, 62500)
    assert.equal(season.collectedCents, 30500)
    assert.equal(season.outstandingCents, 7500 + 12500 + 12500)
    assert.equal(season.pendingCheckoutCents, 2500)
    assert.equal(season.paidInFullCents, 25000) // the overpayment is capped at the amount
    assert.equal(season.partlyPaidCents, 5000)
    assert.deepEqual(season.members.paid.map(m => m.label), ['Alice', 'Former member'])
    assert.deepEqual(season.members.partly, [{ label: 'bob', balanceCents: 7500 }])
    assert.deepEqual(season.members.unpaid.map(m => m.label), ['Cara', 'Dan'])
})

test('summarizeDues: merges descriptions case-insensitively and shows the most common spelling', () => {
    const groups = summarizeDues([
        dues('a', 'season dues', 10000, 0),
        dues('b', '  Season Dues ', 10000, 0),
        dues('c', 'Season Dues', 10000, 0),
    ], names)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].description, 'Season Dues')
    assert.equal(groups[0].count, 3)
})

test('summarizeDues: mixed amounts have no single amount; most outstanding first; fully paid groups last', () => {
    const groups = summarizeDues([
        dues('a', 'Kit fee', 4000, 4000),
        dues('b', 'Kit fee', 4000, 4000),
        dues('a', 'Tour', 30000, 0),
        dues('b', 'Tour', 25000, 10000),
    ], names)
    assert.deepEqual(groups.map(g => g.description), ['Tour', 'Kit fee'])
    assert.equal(groups[0].amountCents, null)
    assert.equal(groups[0].outstandingCents, 45000)
    const kit = groups[1]
    assert.equal(kit.amountCents, 4000)
    assert.deepEqual([kit.paidInFull, kit.partlyPaid, kit.unpaid, kit.outstandingCents, kit.collectedCents], [2, 0, 0, 0, 8000])
    // A label function works too.
    assert.equal(summarizeDues([dues('z', 'Kit fee', 4000, 0)], s => `#${s}`)[0].members.unpaid[0].label, '#z')
})

test('formatSummaryCents drops cents only for whole dollars', () => {
    assert.equal(formatSummaryCents(195000), '$1,950')
    assert.equal(formatSummaryCents(2550), '$25.50')
})

test('volunteer and waived are credit methods offered in the picker, and need a note', () => {
    assert.deepEqual(
        MANUAL_PAYMENT_METHODS.filter(m => m.kind === 'credit').map(m => [m.value, m.option]),
        [['volunteer', 'Volunteered (time, not money)'], ['waived', 'Waived']],
    )
    assert.equal(isCreditMethod('volunteer'), true)
    assert.equal(isCreditMethod('waived'), true)
    assert.equal(isCreditMethod('cash'), false)
    assert.equal(isCreditMethod('stripe'), false)
    assert.equal(isCreditMethod(null), false)
    assert.equal(noteRequiredMessage('cash'), null)
    assert.match(noteRequiredMessage('volunteer') ?? '', /what they did/)
    assert.match(noteRequiredMessage('waived') ?? '', /why/)
    assert.equal(notePlaceholder('volunteer'), 'What did they do? e.g. Reffed U12 game 3/14')
    assert.equal(notePlaceholder('waived'), 'Why? e.g. Scholarship, injury')
    assert.equal(notePlaceholder('cash'), 'Paid cash at practice 11/20')
})

test('parseRecordPaymentForm: volunteer and waived require a note; with one they parse', () => {
    for (const method of ['volunteer', 'waived'] as const) {
        const blank = parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '50', method, note: '   ' }))
        assert.equal(blank.ok, false, method)
        assert.equal(!blank.ok && blank.message, noteRequiredMessage(method))
        assert.equal(blank.values.method, method) // echoed back so the picker keeps it

        const ok = parseRecordPaymentForm(form({ id: ID, assessmentId: 'a-1', amount: '50', method, note: 'Reffed U12 game 3/14' }))
        assert.deepEqual(ok.ok && ok.value.payment, { id: ID, amountCents: 5000, method, note: 'Reffed U12 game 3/14' })
    }
})

test('creditedCentsOf treats a missing or odd value as 0 and never exceeds paid', () => {
    assert.equal(creditedCentsOf({ paidCents: 5000 }), 0)
    assert.equal(creditedCentsOf({ paidCents: 5000, creditedCents: 2000 }), 2000)
    assert.equal(creditedCentsOf({ paidCents: 5000, creditedCents: -1 }), 0)
    assert.equal(creditedCentsOf({ paidCents: 1000, creditedCents: 2000 }), 1000)
})

test('summarizeDues: collected is money only; credit is split out but still counts toward paid status', () => {
    const [g] = summarizeDues([
        dues('a', 'Season dues', 10000, 10000, 0, 10000), // fully waived
        dues('b', 'Season dues', 10000, 10000, 0, 2500),  // $75 money + $25 volunteered
        dues('c', 'Season dues', 10000, 4000, 0, 4000),   // partly, all volunteered
        dues('d', 'Season dues', 10000, 3000),            // partly, money (no creditedCents from older API)
        dues('x', 'Season dues', 10000, 0),
    ], names)
    assert.deepEqual([g.paidInFull, g.partlyPaid, g.unpaid], [2, 2, 1])
    assert.equal(g.collectedCents, 7500 + 3000)
    assert.equal(g.creditedCents, 10000 + 2500 + 4000)
    assert.equal(g.outstandingCents, 6000 + 7000 + 10000)
    assert.equal(g.paidInFullCents, 7500)
    assert.equal(g.paidInFullCreditedCents, 12500)
    assert.equal(g.partlyPaidCents, 3000)
    assert.equal(g.partlyPaidCreditedCents, 4000)
    assert.deepEqual(g.members.paid.map(m => m.label), ['Alice', 'bob'])
})

test('summary money line splits collected and credited, and omits credited when 0', () => {
    const groups = summarizeDues([
        dues('a', 'Season dues', 150000, 120000, 0, 25000),
        dues('b', 'Kit fee', 100000, 100000),
        dues('c', 'Kit fee', 80000, 0),
    ], names)
    const totals = duesSummaryTotals(groups)
    assert.deepEqual(totals, { collectedCents: 195000, creditedCents: 25000, outstandingCents: 110000 })
    assert.equal(duesMoneyLine(totals), '$1,950 collected · $250 credited · $1,100 outstanding')
    assert.equal(duesMoneyLine({ collectedCents: 195000, creditedCents: 0, outstandingCents: 80000 }), '$1,950 collected · $800 outstanding')
})
