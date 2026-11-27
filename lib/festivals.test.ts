import { test } from 'node:test'
import assert from 'node:assert/strict'
import { festivalForClubEvent, withoutFestivalDuplicates } from './festivals'

const tampaMatch = { date: '2026-12-12', homeTeam: 'Claymores', awayTeam: 'Claymores' }
const highland = { date: '2027-01-16', homeTeam: 'Claymores', awayTeam: 'Claymores' }
const lakeland = { date: '2026-12-12', homeTeam: 'Claymores', awayTeam: 'Lakeland' }
const tampaFestival = { eventType: 'festival' as const, startDate: '2026-12-12', active: true }

test('a club event on a festival day is left to the festival card', () => {
    assert.deepEqual(withoutFestivalDuplicates([tampaMatch, highland, lakeland], [tampaFestival]), [highland, lakeland])
})

test('inactive festivals and other event types hide nothing', () => {
    assert.equal(withoutFestivalDuplicates([tampaMatch], [{ ...tampaFestival, active: false }]).length, 1)
    assert.equal(withoutFestivalDuplicates([tampaMatch], [{ ...tampaFestival, eventType: 'event' }]).length, 1)
})

test('the Tampa club-event doc defers to the festival; real matches and other days do not', () => {
    assert.equal(festivalForClubEvent(tampaMatch, [tampaFestival]), tampaFestival)
    assert.equal(festivalForClubEvent(lakeland, [tampaFestival]), undefined)
    assert.equal(festivalForClubEvent(highland, [tampaFestival]), undefined)
})
