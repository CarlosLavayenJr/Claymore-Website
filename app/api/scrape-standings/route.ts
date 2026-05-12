import * as cheerio from 'cheerio'
import { createClient } from '@sanity/client'

// Columns we pull from the rugbyfl.com "Championship_Print.asp" standings table.
// The table has 19 columns including a leading "Pos" (always 0) and per-team
// tries/conversions/cards we don't surface. Order in source HTML:
//
//  0  Pos
//  1  Pool          <- keep
//  2  Team          <- keep (anchor text)
//  3  Played        <- keep
//  4  Won           <- keep
//  5  Lost          <- keep
//  6  Drawn         <- keep
//  7  Tries For
//  8  Conversions
//  9  Penalty Kicks
//  10 Drop Goals
//  11 Points Favor   <- keep
//  12 Points Against <- keep
//  13 Points Diff    <- keep
//  14 Yellow Cards
//  15 Red Cards
//  16 Points
//  17 Bonus Points   <- keep
//  18 Total Points   <- keep (sort key)

interface ScrapedRow {
    teamName: string
    pool: string
    played: number
    won: number
    lost: number
    drawn: number
    pointsFor: number
    pointsAgainst: number
    pointsDifference: number
    bonusPoints: number
    totalPoints: number
}

function toInt(text: string | undefined): number {
    if (!text) return 0
    const n = parseInt(text.replace(/\u00a0/g, '').trim(), 10)
    return Number.isFinite(n) ? n : 0
}

function parseStandings(html: string): ScrapedRow[] {
    const $ = cheerio.load(html)
    const rows: ScrapedRow[] = []

    // Find the standings table: the one whose header row mentions our expected columns.
    const tables = $('table').toArray()
    const standingsTable = tables.find((table) => {
        const headerText = $(table).find('tr').first().text().toLowerCase()
        return (
            headerText.includes('pos') &&
            headerText.includes('pool') &&
            headerText.includes('team') &&
            headerText.includes('played') &&
            headerText.includes('total points')
        )
    })

    if (!standingsTable) return rows

    $(standingsTable).find('tr').each((_i, tr) => {
        const cells = $(tr).find('td')
        if (cells.length < 19) return

        const teamAnchor = cells.eq(2).find('a').first()
        const teamName = (teamAnchor.text() || cells.eq(2).text())
            .replace(/\u00a0/g, '')
            .replace(/\s+/g, ' ')
            .trim()
        if (!teamName || teamName.toLowerCase() === 'team') return

        rows.push({
            teamName,
            pool: cells.eq(1).text().trim(),
            played: toInt(cells.eq(3).text()),
            won: toInt(cells.eq(4).text()),
            lost: toInt(cells.eq(5).text()),
            drawn: toInt(cells.eq(6).text()),
            pointsFor: toInt(cells.eq(11).text()),
            pointsAgainst: toInt(cells.eq(12).text()),
            pointsDifference: toInt(cells.eq(13).text()),
            bonusPoints: toInt(cells.eq(17).text()),
            totalPoints: toInt(cells.eq(18).text()),
        })
    })

    return rows
}

// ── Fallback: compute standings from the schedule table on the same page ────
//
// Older championships often have "Standings are not available at this time."
// but a fully populated schedule. Each match row carries the per-team total
// points (TP) and bonus points (BP) — summing those gives us a valid table.

interface ScheduleMatch {
    date: string // ISO date YYYY-MM-DD if parseable, otherwise ''
    homeName: string
    awayName: string
    homeScore: number | null
    awayScore: number | null
    homeTries: number
    awayTries: number
    note: string
}

function parseScheduleMatches(html: string): ScheduleMatch[] {
    const $ = cheerio.load(html)
    const out: ScheduleMatch[] = []

    // Find the schedule table by header signature.
    const tables = $('table').toArray()
    const scheduleTable = tables.find((table) => {
        const headerText = $(table).find('tr').first().text().toLowerCase()
        return (
            headerText.includes('date') &&
            headerText.includes('home') &&
            headerText.includes('tries') &&
            headerText.includes('away') &&
            // Both BP and TP columns — distinguishes schedule from any other table.
            (headerText.match(/bp/g) ?? []).length >= 2
        )
    })

    if (!scheduleTable) return out

    const trs = $(scheduleTable).find('tr').toArray()
    for (let i = 0; i < trs.length; i++) {
        const tr = trs[i]
        const cells = $(tr).find('td')
        // Match row has 14 cells: Date | Home | (Score) | Tries | P | BP | TP | <spacer> | Away | (Score) | Tries | P | BP | TP
        if (cells.length < 14) continue

        const homeName = stripWhitespace(cells.eq(1).find('a').text() || cells.eq(1).text())
        const awayName = stripWhitespace(cells.eq(8).find('a').text() || cells.eq(8).text())
        if (!homeName || !awayName) continue
        if (homeName.toLowerCase() === 'home' && awayName.toLowerCase() === 'away') continue // header

        // Scores: rugbyfl wraps played scores in parens like "(31)". Unplayed games have a bare "0".
        const homeScore = parseScoreCell(cells.eq(2).text())
        const awayScore = parseScoreCell(cells.eq(9).text())

        // Look at the next row for an attached note. Notes are colspan rows that
        // render as 2 cells in cheerio (the leading spacer + the note body).
        let note = ''
        if (i + 1 < trs.length) {
            const nextCells = $(trs[i + 1]).find('td')
            if (nextCells.length <= 2) {
                const nextText = nextCells.text().trim()
                if (/note:?/i.test(nextText)) {
                    note = nextText.replace(/^[\s\u00a0]*note:?\s*/i, '').trim()
                }
            }
        }

        out.push({
            date: parseScheduleDate(cells.eq(0).text()),
            homeName,
            awayName,
            homeScore,
            awayScore,
            homeTries: toInt(cells.eq(3).text()),
            awayTries: toInt(cells.eq(10).text()),
            note,
        })
    }

    return out
}

function stripWhitespace(s: string): string {
    return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// "(31)" → 31, "0" → null (unplayed), "" → null
function parseScoreCell(raw: string): number | null {
    const m = raw.replace(/\u00a0/g, ' ').trim().match(/^\((-?\d+)\)$/)
    if (!m) return null
    const n = parseInt(m[1], 10)
    return Number.isFinite(n) ? n : null
}

const PLAYOFF_KEYWORDS = /semi[-\s]?final|quarter[-\s]?final|state final|gulf coast|super regional|cup final|grand final|playoff|championship final|clubs final|3rd place|third place/i

function isPlayoff(note: string): boolean {
    return PLAYOFF_KEYWORDS.test(note)
}

// "4/1/2023" → "2023-04-01"; falsy/unparseable → ''
function parseScheduleDate(raw: string): string {
    const m = raw.replace(/\u00a0/g, ' ').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!m) return ''
    const [, mo, da, yr] = m
    return `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
}

// ── Playoff extraction ──────────────────────────────────────────────────────
//
// Walk the same parsed schedule and bucket games whose Note marks them as a
// bracket fixture. Returns matches in source order (we rely on rugbyfl listing
// rounds chronologically — earlier dates = earlier rounds).

type PlayoffRound = 'quarter' | 'semi' | 'final' | 'third'

interface PlayoffEntry {
    round: PlayoffRound
    label: string
    date: string
    homeTeam: string
    awayTeam: string
    homeScore: number | null
    awayScore: number | null
}

function classifyRound(note: string): PlayoffRound | null {
    const n = note.toLowerCase()
    if (/quarter[-\s]?final/.test(n)) return 'quarter'
    if (/semi[-\s]?final/.test(n)) return 'semi'
    if (/3rd place|third place/.test(n)) return 'third'
    // Match "final" only after the more specific patterns above so semis don't fall through.
    if (/\bfinal\b|championship|clubs final|cup final|grand final|state final/.test(n)) return 'final'
    return null
}

function extractPlayoffs(matches: ScheduleMatch[]): PlayoffEntry[] {
    const out: PlayoffEntry[] = []
    for (const m of matches) {
        if (isCancelled(m.note)) continue
        const round = classifyRound(m.note)
        if (!round) continue
        out.push({
            round,
            label: m.note,
            date: m.date,
            homeTeam: m.homeName,
            awayTeam: m.awayName,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
        })
    }
    return out
}

// Returns true when the note explicitly states the game was cancelled and NOT
// played (forfeits where the game was actually played should still count).
function isCancelled(note: string): boolean {
    if (!note) return false
    if (/game not played/i.test(note)) return true
    if (/^cancel(l)?ed/i.test(note) && !/forfeit/i.test(note)) return true
    return false
}

// Standard World Rugby league scoring — what rugbyfl uses when they bother to
// publish it. We recompute fresh from the schedule rather than trusting
// rugbyfl's TP/BP columns because their older seasons have gaps (lots of zero
// TPs even for clear wins).
//
//   Win   = 4
//   Draw  = 2
//   Loss  = 0
//   +1 try bonus    when a team scores ≥ 4 tries
//   +1 losing bonus when a team loses by ≤ 7
function computeStandingsFromSchedule(matches: ScheduleMatch[]): ScrapedRow[] {
    interface Accum {
        teamName: string
        played: number
        won: number
        lost: number
        drawn: number
        pointsFor: number
        pointsAgainst: number
        bonusPoints: number
        totalPoints: number
    }
    const byTeam = new Map<string, Accum>()

    const ensure = (name: string): Accum => {
        const existing = byTeam.get(name)
        if (existing) return existing
        const fresh: Accum = {
            teamName: name,
            played: 0,
            won: 0,
            lost: 0,
            drawn: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            bonusPoints: 0,
            totalPoints: 0,
        }
        byTeam.set(name, fresh)
        return fresh
    }

    for (const m of matches) {
        if (isCancelled(m.note)) continue
        if (isPlayoff(m.note)) continue
        if (m.homeScore == null && m.awayScore == null) continue

        const home = ensure(m.homeName)
        const away = ensure(m.awayName)
        const hs = m.homeScore ?? 0
        const as = m.awayScore ?? 0

        home.played++
        away.played++
        home.pointsFor += hs
        home.pointsAgainst += as
        away.pointsFor += as
        away.pointsAgainst += hs

        const margin = Math.abs(hs - as)
        const isForfeit = /forfeit/i.test(m.note)

        // Bonus points — World Rugby standard. Skip bonuses on forfeits where
        // no real match was played (the winning team didn't actually score
        // 4 tries on the pitch even though the score is 20-0).
        let homeBonus = 0
        let awayBonus = 0
        if (!isForfeit) {
            if (m.homeTries >= 4) homeBonus++
            if (m.awayTries >= 4) awayBonus++
            if (hs < as && margin <= 7) homeBonus++
            if (as < hs && margin <= 7) awayBonus++
        }

        // Match points
        let homeMatch = 0
        let awayMatch = 0
        if (hs > as) {
            home.won++
            away.lost++
            homeMatch = 4
        } else if (hs < as) {
            away.won++
            home.lost++
            awayMatch = 4
        } else {
            home.drawn++
            away.drawn++
            homeMatch = 2
            awayMatch = 2
        }

        home.bonusPoints += homeBonus
        away.bonusPoints += awayBonus
        home.totalPoints += homeMatch + homeBonus
        away.totalPoints += awayMatch + awayBonus
    }

    return Array.from(byTeam.values()).map((a) => ({
        teamName: a.teamName,
        pool: '', // not derivable from the schedule alone — editable in Studio
        played: a.played,
        won: a.won,
        lost: a.lost,
        drawn: a.drawn,
        pointsFor: a.pointsFor,
        pointsAgainst: a.pointsAgainst,
        pointsDifference: a.pointsFor - a.pointsAgainst,
        bonusPoints: a.bonusPoints,
        totalPoints: a.totalPoints,
    }))
}

// Sort by Total Points desc, then Points Difference desc — standard rugby tiebreaker.
// Position is 1-indexed in display order.
function sortAndRank(rows: ScrapedRow[]): Array<ScrapedRow & { position: number }> {
    const sorted = [...rows].sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
        if (b.pointsDifference !== a.pointsDifference) return b.pointsDifference - a.pointsDifference
        return a.teamName.localeCompare(b.teamName)
    })
    return sorted.map((r, i) => ({ ...r, position: i + 1 }))
}

interface ChampionshipDoc {
    _id: string
    active?: boolean
    championshipId?: string
    seasonLabel?: string
    divisionName?: string
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'
    const overrideCid = searchParams.get('championshipId')
    const overrideSeason = searchParams.get('seasonLabel')
    const overrideDivision = searchParams.get('divisionName')

    // Auth: cron uses Bearer CRON_SECRET. Manual backfill calls must include the same.
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sanity = createClient({
        projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
        dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
        apiVersion: '2024-01-01',
        token: process.env.SANITY_API_TOKEN!,
        useCdn: false,
    })

    // Resolve target championship: explicit override (manual backfill) wins,
    // otherwise read the singleton.
    let championshipId: string
    let seasonLabel: string
    let divisionName: string | null

    if (overrideCid && overrideSeason) {
        championshipId = overrideCid
        seasonLabel = overrideSeason
        divisionName = overrideDivision ?? null
    } else {
        const doc = await sanity.fetch<ChampionshipDoc | null>(
            `*[_type == "leagueChampionship" && _id == "leagueChampionship"][0]`,
        )
        if (!doc) {
            return Response.json(
                { error: 'No leagueChampionship singleton found. Create one in Studio.' },
                { status: 404 },
            )
        }
        if (!force && doc.active === false) {
            return Response.json({ skipped: true, reason: 'leagueChampionship.active is false' })
        }
        if (!doc.championshipId || !doc.seasonLabel) {
            return Response.json(
                { error: 'leagueChampionship is missing championshipId or seasonLabel' },
                { status: 400 },
            )
        }
        championshipId = doc.championshipId
        seasonLabel = doc.seasonLabel
        divisionName = doc.divisionName ?? null
    }

    const url = `https://rugbyfl.com/Season/Championships/Championship_Print.asp?Championship_ID=${championshipId}`
    console.log(`[scrape-standings] Fetching ${url}`)

    let res: Response
    try {
        res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClaymoresScraper/1.0)' },
            next: { revalidate: 0 },
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await stampStatus(sanity, `fetch error: ${message}`)
        return Response.json({ error: 'fetch failed', detail: message }, { status: 502 })
    }

    if (!res.ok) {
        const message = `HTTP ${res.status}`
        await stampStatus(sanity, message)
        return Response.json({ error: 'fetch failed', detail: message }, { status: 502 })
    }

    const html = await res.text()
    // We always parse the schedule (cheap) — used as a fallback for standings
    // and as the source for playoff bracket extraction either way.
    const scheduleMatches = parseScheduleMatches(html)
    let parsedRows = parseStandings(html)
    let source: 'standings-table' | 'computed-from-schedule' = 'standings-table'

    // Fallback for championships where rugbyfl hasn't published a standings
    // table (common for older seasons — page shows "Standings are not available
    // at this time."). We compute from the per-match TP/BP columns in the
    // schedule on the same page, which gives an equivalent table.
    if (parsedRows.length === 0 && scheduleMatches.length > 0) {
        parsedRows = computeStandingsFromSchedule(scheduleMatches)
        source = 'computed-from-schedule'
    }

    if (parsedRows.length === 0) {
        await stampStatus(sanity, 'parsed 0 rows — page structure may have changed')
        return Response.json({ error: 'parsed 0 rows' }, { status: 502 })
    }

    const playoffs = extractPlayoffs(scheduleMatches)
    const rankedRows = sortAndRank(parsedRows)
    const docId = `leagueStandings-${championshipId}`
    const now = new Date().toISOString()

    try {
        await sanity.createOrReplace({
            _id: docId,
            _type: 'leagueStandings',
            championshipId,
            seasonLabel,
            divisionName,
            lastUpdated: now,
            rows: rankedRows.map((r) => ({
                _type: 'row',
                _key: `r-${r.position}-${slugifyKey(r.teamName)}`,
                ...r,
            })),
            playoffs: playoffs.map((p, i) => ({
                _type: 'playoffMatch',
                _key: `p-${i}-${slugifyKey(p.homeTeam)}-${slugifyKey(p.awayTeam)}`,
                ...p,
            })),
        })
        await stampStatus(
            sanity,
            source === 'computed-from-schedule' ? 'success (computed from schedule)' : 'success',
        )
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await stampStatus(sanity, `sanity write error: ${message}`)
        return Response.json({ error: 'sanity write failed', detail: message }, { status: 500 })
    }

    // Revalidate dependent pages so visitors see new data quickly.
    // Sanity webhook will also hit /api/revalidate on createOrReplace — this just shortens latency.
    if (process.env.SANITY_REVALIDATE_SECRET) {
        try {
            const revalidateUrl = new URL(request.url)
            revalidateUrl.pathname = '/api/revalidate'
            revalidateUrl.searchParams.set('secret', process.env.SANITY_REVALIDATE_SECRET)
            await fetch(revalidateUrl.toString(), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ _type: 'leagueStandings', seasonLabel }),
            })
        } catch {
            // best-effort — Sanity webhook will retry the canonical revalidation path anyway
        }
    }

    return Response.json({
        success: true,
        championshipId,
        seasonLabel,
        rowCount: rankedRows.length,
        playoffCount: playoffs.length,
        source,
        url,
    })
}

function slugifyKey(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48)
}

async function stampStatus(
    sanity: ReturnType<typeof createClient>,
    status: string,
): Promise<void> {
    try {
        await sanity
            .patch('leagueChampionship')
            .set({ lastScrapedAt: new Date().toISOString(), lastScrapeStatus: status })
            .commit({ autoGenerateArrayKeys: true })
    } catch {
        // singleton may not exist yet on first run with override mode — ignore
    }
}
