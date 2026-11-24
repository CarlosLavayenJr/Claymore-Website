import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'opentype.js'
import { buildGraphicData, lineupProblems, type GraphicsDocument, type LineupSlot, type MatchRecord, type PlayerRecord } from './model'
import { formatGraphicDate, renderGraphic } from './render'

const players: PlayerRecord[] = Array.from({ length: 23 }, (_, i) => ({ _id: `p${i + 1}`, name: `PLAYER ${i + 1}`, active: true, cutouts: [{ assetId: `image-${i + 1}`, url: '/cutout.png', hasAlpha: true }] }))
const slots: LineupSlot[] = players.map((p, i) => ({ number: i + 1, player: { _ref: p._id }, featured: i === 7 }))
const match: MatchRecord = {
    _id: 'm1', date: '2026-11-14', kickoffTime: '3:00 PM', venue: 'Barnett Park, Orlando',
    homeTeam: 'Claymores', awayTeam: 'Opponent', homeScore: 56, awayScore: 0, status: 'played',
    homeTeamRef: { name: 'Claymores', logoUrl: '/club.png' }, awayTeamRef: { name: 'Opponent', logoUrl: '/opponent.png' },
}
const doc: GraphicsDocument = { match: { _ref: 'm1' }, clubSide: 'home', template: 'featured', lineup: slots }

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
    assert.deepEqual(buildGraphicData({ ...doc, lineup: [], template: 'finalScore' }, match, []).errors, [])
})
test('missing match metadata and crest are actionable export blockers', () => {
    const { errors } = buildGraphicData({ ...doc, clubSide: undefined }, { ...match, date: '', kickoffTime: '', venue: '', awayTeamRef: undefined }, players)
    for (const fragment of ['home or away', 'valid date', 'venue', 'kickoff', 'logo']) assert.ok(errors.some(e => e.includes(fragment)))
})
const featuring = (numbers: number[], lineup = slots) => lineup.map(s => ({ ...s, featured: numbers.includes(s.number!) }))
test('photo requirements depend on template; featured count must match the template', () => {
    const withoutPhotos = players.map(p => ({ ...p, cutouts: [] }))
    assert.ok(buildGraphicData(doc, match, withoutPhotos).errors.some(e => e.includes('body shot')))
    assert.ok(buildGraphicData({ ...doc, template: 'pitch' }, match, withoutPhotos).errors.filter(e => e.includes('body shot')).length === 15)
    assert.ok(buildGraphicData({ ...doc, template: 'threePlayers' }, match, players).errors.some(e => e.includes('exactly 3') && e.includes('currently 1')))
    assert.deepEqual(buildGraphicData({ ...doc, template: 'threePlayers', lineup: featuring([2, 10, 1]) }, match, players).errors, [])
    assert.ok(buildGraphicData({ ...doc, lineup: featuring([]) }, match, players).errors.some(e => e.includes('exactly 1')))
})
test('featured players render in position order, and a sub can be featured', () => {
    const { data, errors } = buildGraphicData({ ...doc, template: 'threePlayers', lineup: featuring([10, 2, 18]) }, match, players)
    assert.deepEqual(errors, [])
    assert.deepEqual(data.featured.map(p => p.number), [2, 10, 18])
})
test('a slot photo overrides the player default; unknown or opaque photos block export', () => {
    const multi = players.map(p => p._id === 'p8' ? { ...p, cutouts: [{ assetId: 'image-a', url: '/a.png', hasAlpha: true }, { assetId: 'image-b', url: '/b.png', hasAlpha: true }] } : p)
    const pick = (ref: string) => slots.map(s => s.number === 8 ? { ...s, photo: { asset: { _ref: ref } } } : s)
    assert.equal(buildGraphicData(doc, match, multi).data.featured[0].photo, '/a.png')
    assert.equal(buildGraphicData({ ...doc, lineup: pick('image-b') }, match, multi).data.featured[0].photo, '/b.png')
    // Freshly claimed photos may not be on the loaded player record yet; the photos list resolves them.
    assert.equal(buildGraphicData({ ...doc, lineup: pick('image-new') }, match, multi, undefined, [{ assetId: 'image-new', url: '/new.png', hasAlpha: true }]).data.featured[0].photo, '/new.png')
    assert.ok(buildGraphicData({ ...doc, lineup: pick('image-gone') }, match, multi).errors.some(e => e.includes('could not be loaded')))
    assert.ok(buildGraphicData({ ...doc, lineup: pick('image-jpg') }, match, multi, undefined, [{ assetId: 'image-jpg', url: '/x.jpg', hasAlpha: false }]).errors.some(e => e.includes('has a background')))
})
test('saved draft IDs resolve and positions/inactive players generate warnings, not silent substitutions', () => {
    const lineup = slots.map(s => s.number === 8 ? { ...s, player: { _ref: 'drafts.p8' } } : s)
    const result = buildGraphicData({ ...doc, lineup }, match, players.map(p => p._id === 'p8' ? { ...p, active: false, eligiblePositions: [4, 5], graphicName: 'SHORT NAME' } : p))
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
