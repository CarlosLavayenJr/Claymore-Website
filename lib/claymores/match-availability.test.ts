import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ClaymoresApiClient, type FetchLike, type MemberAvailability } from './api-client'
import {
    availabilityLabel,
    countsLine,
    groupMembers,
    isFixtureId,
    lineupValues,
    matchAnchor,
    parseAvailabilityForm,
    parseLineupForm,
    positionOf,
    shortMatchDate,
    todayInOrlando,
    upcomingMatches,
} from './match-availability'

const form = (v: Record<string, string>) => ({ get: (k: string) => v[k] ?? null })
const member = (subject: string, name: string | null, status: MemberAvailability['status'], note: string | null = null): MemberAvailability =>
    ({ subject, email: `${subject}@example.com`, name, status, note, updatedAt: null })

test('labels answers and summarizes counts', () => {
    assert.equal(availabilityLabel('available'), 'Available')
    assert.equal(availabilityLabel('maybe'), 'Maybe')
    assert.equal(availabilityLabel('unavailable'), 'Out')
    assert.equal(availabilityLabel(null), 'No reply')
    assert.equal(availabilityLabel('later'), 'No reply')
    assert.equal(countsLine({ available: 14, maybe: 3, unavailable: 2, noReply: 10 }), '14 available · 3 maybe · 2 out · 10 no reply')
    assert.equal(countsLine({ available: 4, maybe: 0, unavailable: 0, noReply: 1 }), '4 available · 1 no reply')
    assert.equal(countsLine({ available: 0, maybe: 0, unavailable: 0, noReply: 0 }), 'No answers yet')
})

test('today is the Orlando date, not UTC', () => {
    // 02:30 UTC on Jan 24 is still Jan 23 in Orlando (EST, UTC-5).
    assert.equal(todayInOrlando(new Date('2027-01-24T02:30:00Z')), '2027-01-23')
    assert.equal(todayInOrlando(new Date('2027-01-24T05:30:00Z')), '2027-01-24')
    // Summer (EDT, UTC-4).
    assert.equal(todayInOrlando(new Date('2026-07-04T03:59:00Z')), '2026-07-03')
})

test('picks the next Claymores matches: upcoming, from today, no club events, by date', () => {
    const m = (id: string, date: string, home: string, away: string, status = 'upcoming') => ({ _id: id, date, homeTeam: home, awayTeam: away, status })
    const all = [
        m('later', '2027-02-06', 'Claymores', 'Tampa'),
        m('past', '2027-01-09', 'Claymores', 'Daytona', 'played'),
        m('stale', '2027-01-16', 'Claymores', 'Sarasota'), // still "upcoming" but before today
        m('games', '2027-01-30', 'Claymores', 'Claymores'), // Highland Games
        m('today', '2027-01-23', 'Lakeland (D3)', 'Claymores'),
        m('cancelled', '2027-01-25', 'Claymores', 'Miami', 'cancelled'),
    ]
    assert.deepEqual(upcomingMatches(all, '2027-01-23').map(x => x._id), ['today', 'later'])
    assert.deepEqual(upcomingMatches(all, '2027-01-23', 1).map(x => x._id), ['today'])
    assert.equal(shortMatchDate('2027-01-23'), 'Sat, Jan 23')
})

test('groups members for the picker: Available, Maybe, No reply, Out, each by name', () => {
    const groups = groupMembers([
        member('z', 'Zed', 'available'),
        member('a', 'amy', 'available'),
        member('m', 'Max', 'maybe', 'first half only'),
        member('n', null, null),
        member('o', 'Ollie', 'unavailable'),
        member('w', 'Will', 'weird' as never),
    ])
    assert.deepEqual(groups.map(g => g.label), ['Available', 'Maybe', 'No reply', 'Out'])
    assert.deepEqual(groups.map(g => g.members.map(x => x.subject)), [['a', 'z'], ['m'], ['n', 'w'], ['o']])
    assert.deepEqual(groupMembers([]).map(g => g.members.length), [0, 0, 0, 0])
})

test('positions match the API: 1-15 named, 16-23 replacements', () => {
    assert.equal(positionOf(1), 'Loosehead prop')
    assert.equal(positionOf(2), 'Hooker')
    assert.equal(positionOf(9), 'Scrum-half')
    assert.equal(positionOf(15), 'Fullback')
    assert.equal(positionOf(16), 'Replacement')
    assert.equal(positionOf(23), 'Replacement')
})

test('lineup values fill all 23 numbers from saved slots', () => {
    const values = lineupValues({ slots: [{ number: 1, position: 'Loosehead prop', subject: 'p1', name: 'Pat' }, { number: 23, position: 'Replacement', subject: 'r', name: null }, { number: 40, position: '?', subject: 'x', name: null }] })
    assert.equal(Object.keys(values).length, 23)
    assert.equal(values[1], 'p1')
    assert.equal(values[23], 'r')
    assert.equal(values[2], '')
    assert.deepEqual(Object.values(lineupValues(null)).filter(Boolean), [])
})

test('parses the lineup form into the API body', () => {
    const parsed = parseLineupForm(form({ fixtureId: 'abc123', 'slot-1': 'p1', 'slot-2': ' p2 ', 'slot-16': 'r1', intent: 'publish' }))
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.equal(parsed.fixtureId, 'abc123')
    assert.deepEqual(parsed.input, {
        slots: [{ number: 1, subject: 'p1' }, { number: 2, subject: 'p2' }, { number: 16, subject: 'r1' }],
        publish: true,
    })
    assert.equal(parsed.values[2], 'p2')

    const draft = parseLineupForm(form({ fixtureId: 'abc123', intent: 'draft' }))
    assert.deepEqual(draft.ok && draft.input, { slots: [], publish: false })
    const noIntent = parseLineupForm(form({ fixtureId: 'abc123', 'slot-3': 'p3' }))
    assert.equal(noIntent.ok && noIntent.input.publish, false)
})

test('rejects a player picked twice and a tampered fixture id, keeping the picks', () => {
    const dup = parseLineupForm(form({ fixtureId: 'abc123', 'slot-4': 'p1', 'slot-5': 'p2', 'slot-18': 'p1' }))
    assert.equal(dup.ok, false)
    if (dup.ok) return
    assert.match(dup.message, /picked for 4 and 18/)
    assert.equal(dup.values[5], 'p2')
    assert.equal(dup.fixtureId, 'abc123')

    const bad = parseLineupForm(form({ fixtureId: '../admin', 'slot-1': 'p1' }))
    assert.equal(bad.ok, false)
    assert.equal(bad.fixtureId, null)
    assert.equal(bad.values[1], 'p1')
})

test('parses the member answer form', () => {
    assert.deepEqual(parseAvailabilityForm(form({ fixtureId: 'abc', status: 'maybe', note: ' first half only ' })),
        { ok: true, fixtureId: 'abc', status: 'maybe', note: 'first half only' })
    assert.deepEqual(parseAvailabilityForm(form({ fixtureId: 'abc', status: 'unavailable', note: '' })),
        { ok: true, fixtureId: 'abc', status: 'unavailable', note: null })
    assert.deepEqual(parseAvailabilityForm(form({ fixtureId: 'abc', status: 'yes' })), { ok: false, fixtureId: 'abc' })
    assert.deepEqual(parseAvailabilityForm(form({ fixtureId: 'abc', status: 'available', note: 'x'.repeat(201) })), { ok: false, fixtureId: 'abc' })
    assert.deepEqual(parseAvailabilityForm(form({ fixtureId: 'a/b', status: 'available' })), { ok: false, fixtureId: null })
})

test('fixture ids and anchors', () => {
    assert.equal(isFixtureId('3c9e1f0a-match.2027'), true)
    assert.equal(isFixtureId(''), false)
    assert.equal(isFixtureId('a b'), false)
    assert.equal(isFixtureId(42), false)
    assert.equal(matchAnchor('abc.123'), 'match-abc-123')
})

test('client calls the availability and lineup endpoints', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = []
    const fetch: FetchLike = async (url, init) => {
        calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    }
    const api = new ClaymoresApiClient({ baseUrl: 'https://api.test/', accessToken: 't', fetch })
    await api.fixtureAvailability('f 1')
    await api.answerAvailability('f1', 'maybe', 'late')
    await api.myAvailability()
    await api.fixtureLineup('f1')
    await api.adminFixtureAvailability('f1')
    await api.adminFixtureLineup('f1')
    await api.saveFixtureLineup('f1', { slots: [{ number: 1, subject: 's' }], publish: true })
    assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), [
        'GET https://api.test/v1/fixtures/f%201/availability',
        'PUT https://api.test/v1/fixtures/f1/availability',
        'GET https://api.test/v1/availability/mine',
        'GET https://api.test/v1/fixtures/f1/lineup',
        'GET https://api.test/v1/admin/fixtures/f1/availability',
        'GET https://api.test/v1/admin/fixtures/f1/lineup',
        'PUT https://api.test/v1/admin/fixtures/f1/lineup',
    ])
    assert.deepEqual(calls[1].body, { status: 'maybe', note: 'late' })
    assert.deepEqual(calls[6].body, { slots: [{ number: 1, subject: 's' }], publish: true })
})
