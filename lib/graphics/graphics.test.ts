import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'opentype.js'
import { buildGraphicData, lineupProblems, type GraphicsDocument, type MatchRecord, type PlayerRecord } from './model'
import { formatGraphicDate, renderGraphic } from './render'

const players: PlayerRecord[] = Array.from({ length: 23 }, (_, i) => ({ _id: `p${i + 1}`, name: `PLAYER ${i + 1}`, active: true, cutoutUrl: '/cutout.png' }))
const slots = players.map((p, i) => ({ number: i + 1, player: { _ref: p._id } }))
const match: MatchRecord = {
    _id: 'm1', date: '2026-11-14', kickoffTime: '3:00 PM', venue: 'Barnett Park, Orlando',
    homeTeam: 'Claymores', awayTeam: 'Opponent', homeScore: 56, awayScore: 0, status: 'played',
    homeTeamRef: { name: 'Claymores', logoUrl: '/club.png' }, awayTeamRef: { name: 'Opponent', logoUrl: '/opponent.png' },
}
const doc: GraphicsDocument = { match: { _ref: 'm1' }, clubSide: 'home', template: 'featured', lineup: slots, featuredPlayers: [{ _ref: 'p8' }] }

test('complete lineup and optional bench export successfully', () => {
    assert.deepEqual(buildGraphicData(doc, match, players).errors, [])
    assert.deepEqual(buildGraphicData({ ...doc, lineup: slots.slice(0, 15) }, match, players).errors, [])
})
test('duplicate positions, players (including draft IDs), missing starters and duplicate leadership are rejected', () => {
    const errors = lineupProblems([
        { number: 1, player: { _ref: 'p1' }, role: 'captain' },
        { number: 1, player: { _ref: 'drafts.p1' }, role: 'captain' },
    ], true)
    for (const text of ['assigned more than once', 'more than one position', 'Only one captain', 'missing 2, 3']) assert.ok(errors.some(e => e.includes(text)))
    for (const number of [0, 24, 1.5, undefined]) assert.ok(lineupProblems([{ number }]).length)
})
test('away fixtures map names, crests and scores to Claymores correctly', () => {
    const { data, errors } = buildGraphicData({ ...doc, clubSide: 'away', template: 'finalScore' }, match, [])
    assert.deepEqual(errors, [])
    assert.equal(data.opponent, 'Claymores')
    assert.equal(data.clubScore, 0)
    assert.equal(data.opponentScore, 56)
    assert.equal(data.clubLogo, '/opponent.png')
    assert.equal(data.opponentLogo, '/club.png')
})
test('upcoming, cancelled and forfeit matches cannot export a final-score graphic', () => {
    for (const status of ['upcoming', 'cancelled', 'forfeit_us', 'forfeit_them']) {
        assert.ok(buildGraphicData({ ...doc, template: 'finalScore' }, { ...match, status }, []).errors.some(e => e.includes('Played')))
    }
    for (const score of [undefined, -1, NaN, 0.5]) assert.ok(buildGraphicData({ ...doc, template: 'finalScore' }, { ...match, homeScore: score }, []).errors.some(e => e.includes('valid non-negative')))
})
test('final-score template does not require a lineup or player photos', () => {
    assert.deepEqual(buildGraphicData({ ...doc, lineup: [], featuredPlayers: [], template: 'finalScore' }, match, []).errors, [])
})
test('missing match metadata and crest are actionable export blockers', () => {
    const { errors } = buildGraphicData({ ...doc, clubSide: undefined }, { ...match, date: '', kickoffTime: '', venue: '', awayTeamRef: undefined }, players)
    for (const fragment of ['home or away', 'valid date', 'venue', 'kickoff', 'logo']) assert.ok(errors.some(e => e.includes(fragment)))
})
test('photo requirements depend on template; featured players must be assigned and unique', () => {
    const withoutPhotos = players.map(p => ({ ...p, cutoutUrl: undefined }))
    assert.ok(buildGraphicData(doc, match, withoutPhotos).errors.some(e => e.includes('body shot')))
    assert.ok(buildGraphicData({ ...doc, template: 'pitch' }, match, withoutPhotos).errors.filter(e => e.includes('body shot')).length === 15)
    assert.ok(buildGraphicData({ ...doc, template: 'threePlayers', featuredPlayers: [{ _ref: 'p1' }, { _ref: 'p1' }, { _ref: 'unknown' }] }, match, players).errors.some(e => e.includes('different')))
    assert.ok(buildGraphicData({ ...doc, featuredPlayers: [{ _ref: 'p23' }], lineup: slots.slice(0, 15) }, match, players).errors.some(e => e.includes('must be in this match')))
})
test('saved draft IDs resolve and positions/inactive players generate warnings, not silent substitutions', () => {
    const result = buildGraphicData({ ...doc, featuredPlayers: [{ _ref: 'drafts.p8' }] }, match, players.map(p => p._id === 'p8' ? { ...p, active: false, eligiblePositions: [4, 5], graphicName: 'SHORT NAME' } : p))
    assert.deepEqual(result.errors, [])
    assert.equal(result.data.featured[0].name, 'SHORT NAME')
    assert.equal(result.warnings.length, 2)
})
test('impossible calendar dates block export', () => {
    assert.ok(buildGraphicData(doc, { ...match, date: '2026-02-31' }, players).errors.some(e => e.includes('valid date')))
})

test('selected background must resolve before export', () => {
    assert.ok(buildGraphicData({ ...doc, background: { asset: { _ref: 'image-missing' } } }, match, players).errors.some(e => e.includes('background')))
})
test('all four templates render portable display paths and escape injected content', () => {
    const buffer = readFileSync('public/fonts/VIKING-N.woff')
    const font = parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
    const malicious = '<script>alert("bad")</script>'
    const { data } = buildGraphicData(doc, match, players)
    const pixel = 'data:image/png;base64,iVBORw0KGgo='
    for (const template of ['featured', 'threePlayers', 'pitch', 'finalScore'] as const) {
        const svg = renderGraphic({ ...data, template, opponent: malicious, venue: malicious, clubLogo: pixel, opponentLogo: pixel, featured: data.featured.map(p => ({ ...p, photo: pixel })) }, font)
        assert.ok(svg.includes('width="1080" height="1350"'))
        assert.ok(svg.includes('aria-label='))
        assert.ok(!svg.includes('NaN'), 'Small glyph coordinates must serialize without NaN/truncated headings')
        assert.ok(!svg.includes('Infinity'))
        assert.ok(!svg.includes('<script>'))
        assert.ok(!svg.includes('font-family="Claymore"'))
        assert.ok(!svg.includes('href="/cutout.png"'))
        assert.ok(svg.includes('data:image/png;base64,'))
        assert.ok(svg.includes('id="background"'))
    }
})
test('date-only values render consistently without timezone shifts', () => {
    assert.equal(formatGraphicDate('2026-11-14'), '14 NOV 2026')
    assert.equal(formatGraphicDate(''), 'MATCH DATE')
})
