import * as cheerio from 'cheerio'
import { createClient } from '@sanity/client'

const BASE_URL = 'https://rugbyfl.com/Clubs/Club.asp?Club_ID=117'

type MatchStatus = 'played' | 'upcoming' | 'forfeit_us' | 'forfeit_them'

interface ScrapedMatch {
  _id: string
  _type: 'match'
  date: string        // ISO: YYYY-MM-DD
  season: number
  homeTeam: string
  homeScore: number
  awayTeam: string
  awayScore: number
  status: MatchStatus
  note?: string
}

// Derive season: Sep–Dec belongs to the following spring year (e.g. Sep 2025 → 2026)
function deriveSeason(date: Date): number {
  return date.getMonth() >= 7 ? date.getFullYear() + 1 : date.getFullYear()
}

// Slugify for deterministic Sanity _id
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function isClaymores(name: string): boolean {
  return /claymore/i.test(name)
}

function parseStatus(hasScores: boolean, note: string): MatchStatus {
  if (!hasScores) return 'upcoming'
  if (/forfeit/i.test(note)) {
    // Match "Claymores forfeit" or "Forfeit by Claymores" — Claymores as the subject
    const usForfeited = /claymore.{0,15}forfeit|forfeit.{0,10}by.{0,10}claymore/i.test(note)
    return usForfeited ? 'forfeit_us' : 'forfeit_them'
  }
  return 'played'
}

function parseMatches(html: string): ScrapedMatch[] {
  const $ = cheerio.load(html)
  const matches: ScrapedMatch[] = []

  let currentDate = ''

  // Each game block starts with a .SectionTitleSec date row,
  // followed by a .TableRowBig time/competition row,
  // then a .TeamGame row with team names and optional scores.
  $('td.SectionTitleSec, td.TeamGame').each((_i, el) => {
    const td = $(el)

    if (td.hasClass('SectionTitleSec')) {
      // e.g. "Saturday, September 20, 2025"
      const text = td.text().trim()
      const match = text.match(/(\w+ \d+,\s*\d{4})/)
      if (match) currentDate = match[1]
      return
    }

    // TeamGame cell — skip spacer rows that have no links
    const links = td.find('a')
    if (links.length < 2) return
    if (!currentDate) return

    const dateObj = new Date(currentDate)
    if (isNaN(dateObj.getTime())) return

    // Parse team names (trim leading &nbsp;)
    const homeTeam = links.eq(0).text().replace(/\u00a0/g, '').trim()
    const awayTeam = links.eq(1).text().replace(/\u00a0/g, '').trim()
    if (!homeTeam || !awayTeam) return

    // Scores are inside <font color="#FF0000"><strong>N</strong></font>
    const scores = td.find('font[color="#FF0000"] strong').map((_j, s) => parseInt($(s).text(), 10)).get() as number[]
    const hasScores = scores.length >= 2

    // Note is in the immediately next sibling tr (only if it contains .TableRowNoLine)
    const parentRow = td.closest('tr')
    const nextRow = parentRow.next('tr')
    const note = nextRow.find('.TableRowNoLine').length > 0
      ? nextRow.find('.TableRowNoLine').text().replace(/\s+/g, ' ').trim()
      : ''

    const status = parseStatus(hasScores, note)
    const isoDate = dateObj.toISOString().split('T')[0]
    const season = deriveSeason(dateObj)

    // Normalise Claymores team name; home is always first in the HTML so scores are never swapped
    const displayHome = isClaymores(homeTeam) ? 'Claymores' : homeTeam
    const displayAway = isClaymores(awayTeam) ? 'Claymores' : awayTeam
    // Forfeits: winning team gets 20, forfeiting team gets 0
    let homeScore = hasScores ? scores[0] : 0
    let awayScore = hasScores ? scores[1] : 0
    if (status === 'forfeit_us') {
      // Claymores forfeited — determine which side they're on
      homeScore = isClaymores(displayHome) ? 0 : 20
      awayScore = isClaymores(displayAway) ? 0 : 20
    } else if (status === 'forfeit_them') {
      homeScore = isClaymores(displayHome) ? 20 : 0
      awayScore = isClaymores(displayAway) ? 20 : 0
    }

    const id = `scraped-${isoDate}-${slug(displayHome)}-${slug(displayAway)}`

    const m: ScrapedMatch = {
      _id: id,
      _type: 'match',
      date: isoDate,
      season,
      homeTeam: displayHome,
      homeScore,
      awayTeam: displayAway,
      awayScore,
      status,
      ...(note ? { note } : {}),
    }

    matches.push(m)
  })

  return matches
}

export async function GET(request: Request) {
  // Validate Vercel cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const all = searchParams.get('all') === 'true'
  const seasonId = searchParams.get('seasonId') ?? '27'
  const seasonIds = all ? Array.from({ length: 18 }, (_, i) => String(i + 10)) : [seasonId]

  const sanity = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN!,
    useCdn: false,
  })

  // Fetch all matches and group by date
  const existing: { _id: string; date: string }[] = await sanity.fetch(
    `*[_type == "match"] | order(_createdAt asc) { _id, date }`
  )

  // Deduplicate: for each date keep the FIRST (oldest) doc, delete the rest
  const seenDates = new Map<string, string>() // date → keeper _id
  const toDelete: string[] = []
  for (const m of existing) {
    if (seenDates.has(m.date)) {
      toDelete.push(m._id)
    } else {
      seenDates.set(m.date, m._id)
    }
  }
  if (toDelete.length > 0) {
    console.log(`[scrape-rugby] Deleting ${toDelete.length} duplicate match(es)`)
    await Promise.all(toDelete.map(id => sanity.delete(id)))
  }

  // existingByDate now has one doc per date (the keeper)
  const existingByDate = new Map(seenDates)

  const summary: Record<string, { parsed: number; upserted: number; failed: number }> = {}

  for (const sid of seasonIds) {
    const url = `${BASE_URL}&Season_ID=${sid}`
    console.log(`[scrape-rugby] Scraping Season_ID=${sid}`)

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClaymoresScraper/1.0)' },
        next: { revalidate: 0 },
      })

      if (!res.ok) {
        console.warn(`[scrape-rugby] Season ${sid}: fetch failed ${res.status}`)
        summary[sid] = { parsed: 0, upserted: 0, failed: 1 }
        continue
      }

      const html = await res.text()
      const allMatches = parseMatches(html)

      if (allMatches.length === 0) {
        console.warn(`[scrape-rugby] Season ${sid}: no matches found`)
        summary[sid] = { parsed: 0, upserted: 0, failed: 0 }
        continue
      }

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      // Drop matches: past date with no score recorded (regardless of note)
      const staleIds: string[] = []
      const matches = allMatches.filter(m => {
        const isPast = new Date(m.date) < today
        if (isPast && m.status === 'upcoming') {
          const existingId = existingByDate.get(m.date)
          if (existingId) staleIds.push(existingId)
          return false
        }
        return true
      })

      if (staleIds.length > 0) {
        console.log(`[scrape-rugby] Season ${sid}: removing ${staleIds.length} ghost match(es)`)
        await Promise.all(staleIds.map(id => sanity.delete(id)))
      }

      const results = await Promise.allSettled(
        matches.map(m => {
          const existingId = existingByDate.get(m.date)
          if (existingId) {
            // Patch existing doc — preserves the original _id, no duplicate
            return sanity.patch(existingId).set({
              homeTeam: m.homeTeam,
              homeScore: m.homeScore,
              awayTeam: m.awayTeam,
              awayScore: m.awayScore,
              status: m.status,
              season: m.season,
              ...(m.note ? { note: m.note } : {}),
            }).commit()
          }
          // New match — create with scraped id and register in map for this run
          existingByDate.set(m.date, m._id)
          return sanity.createOrReplace(m)
        })
      )

      const upserted = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      console.log(`[scrape-rugby] Season ${sid}: ${upserted}/${matches.length} upserted`)
      summary[sid] = { parsed: matches.length, upserted, failed }
    } catch (err) {
      console.error(`[scrape-rugby] Season ${sid} error:`, err)
      summary[sid] = { parsed: 0, upserted: 0, failed: 1 }
    }
  }

  const totalParsed = Object.values(summary).reduce((a, b) => a + b.parsed, 0)
  const totalUpserted = Object.values(summary).reduce((a, b) => a + b.upserted, 0)

  return Response.json({ success: true, seasons: summary, totalParsed, totalUpserted })
}
