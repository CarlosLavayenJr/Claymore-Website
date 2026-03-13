import * as cheerio from 'cheerio'
import { createClient } from '@sanity/client'

const SCRAPE_URL = 'https://rugbyfl.com/Clubs/Club.asp?Club_ID=117&Season_ID=27'

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

  console.log('[scrape-rugby] Starting scrape of', SCRAPE_URL)

  try {
    const res = await fetch(SCRAPE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClaymoresScraper/1.0)' },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const msg = `Fetch failed: ${res.status} ${res.statusText}`
      console.error('[scrape-rugby]', msg)
      return Response.json({ error: msg }, { status: 502 })
    }

    const html = await res.text()
    const matches = parseMatches(html)

    if (matches.length === 0) {
      console.warn('[scrape-rugby] No matches parsed — HTML structure may have changed')
      return Response.json({ warning: 'No matches parsed', count: 0 })
    }

    console.log(`[scrape-rugby] Parsed ${matches.length} matches, upserting to Sanity…`)

    const sanity = createClient({
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
      apiVersion: '2024-01-01',
      token: process.env.SANITY_API_TOKEN!,
      useCdn: false,
    })

    const results = await Promise.allSettled(
      matches.map(m => sanity.createOrReplace(m))
    )

    const succeeded = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected')

    if (failed.length > 0) {
      failed.forEach((f, i) => {
        if (f.status === 'rejected') {
          console.error(`[scrape-rugby] Failed to upsert match ${i}:`, f.reason)
        }
      })
    }

    console.log(`[scrape-rugby] Done — ${succeeded}/${matches.length} upserted`)

    return Response.json({
      success: true,
      parsed: matches.length,
      upserted: succeeded,
      failed: failed.length,
      matches: matches.map(m => ({ id: m._id, date: m.date, home: m.homeTeam, away: m.awayTeam, status: m.status })),
    })
  } catch (err) {
    console.error('[scrape-rugby] Unexpected error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
