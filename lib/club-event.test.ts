import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clubEventName, isClubEvent, matchLabel } from './seo'

test('Claymores vs Claymores is a club event; real games are not', () => {
    assert.equal(isClubEvent({ homeTeam: 'Claymores', awayTeam: 'Claymores' }), true)
    assert.equal(isClubEvent({ homeTeam: 'Claymores', awayTeam: 'Lakeland (D3)' }), false)
    assert.equal(isClubEvent({ homeTeam: 'Daytona (D3)', awayTeam: 'Claymores' }), false)
})

test('club event names come from the competition, in title case', () => {
    assert.equal(clubEventName({ competition: 'Annual Highland games' }), 'Annual Highland Games')
    assert.equal(clubEventName({ competition: '  ' }), 'Club event')
    assert.equal(clubEventName({}), 'Club event')
})

test('members see a club event by its name, a match by its opponent', () => {
    assert.equal(matchLabel({ homeTeam: 'Claymores', awayTeam: 'Claymores', competition: 'Annual Highland games' }), 'Annual Highland Games')
    assert.equal(matchLabel({ homeTeam: 'Claymores', awayTeam: 'Lakeland' }), 'vs Lakeland')
    assert.equal(matchLabel({ homeTeam: 'Daytona', awayTeam: 'Claymores' }), 'at Daytona')
})
