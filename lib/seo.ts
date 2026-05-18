import type { SanityCoach, SanityMatch, SanityPlayer, SanityPost, SanityTeam } from '@/sanity/lib/queries'
import type { PracticeSchedule } from '@/lib/practice-schedule'

const WEEKDAY_TO_SCHEMA: Record<string, string> = {
    Sunday: 'https://schema.org/Sunday',
    Monday: 'https://schema.org/Monday',
    Tuesday: 'https://schema.org/Tuesday',
    Wednesday: 'https://schema.org/Wednesday',
    Thursday: 'https://schema.org/Thursday',
    Friday: 'https://schema.org/Friday',
    Saturday: 'https://schema.org/Saturday',
}

// "8–10pm" / "6:30 PM – 8:00 PM" -> { opens: "20:00", closes: "22:00" }
// Best-effort; falls back to undefined for entries we can't parse.
function parseTimeRange(time: string): { opens: string; closes: string } | undefined {
    const normalized = time.replace(/[–—]/g, '-').replace(/\s+/g, '').toLowerCase()
    const m = normalized.match(
        /^(\d{1,2})(?::(\d{2}))?(am|pm)?-(\d{1,2})(?::(\d{2}))?(am|pm)?$/,
    )
    if (!m) return undefined
    const to24 = (h: number, min: number, mer: string | undefined, fallbackMer: string) => {
        const meridian = mer || fallbackMer
        let hour = h
        if (meridian === 'pm' && hour < 12) hour += 12
        if (meridian === 'am' && hour === 12) hour = 0
        return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    }
    const endMer = m[6] || (m[3] ?? 'pm')
    const startMer = m[3] || endMer
    return {
        opens: to24(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, startMer, endMer),
        closes: to24(parseInt(m[4], 10), m[5] ? parseInt(m[5], 10) : 0, endMer, endMer),
    }
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.claymoresrfc.com'
export const CLUB_NAME = 'Central Florida Claymores RFC'

export function abs(path: string): string {
    if (path.startsWith('http')) return path
    return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function slugify(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export function isClaymores(name: string): boolean {
    return /claymore/i.test(name)
}

// Deterministic, URL-friendly slug for a match.
// Format: YYYY-MM-DD-home-vs-away  (e.g. 2025-11-22-claymores-vs-jacksonville)
export function matchSlug(m: { date: string; homeTeam: string; awayTeam: string }): string {
    return `${m.date}-${slugify(m.homeTeam)}-vs-${slugify(m.awayTeam)}`
}

export function findMatchBySlug<T extends { date: string; homeTeam: string; awayTeam: string }>(
    matches: T[],
    slug: string,
): T | undefined {
    return matches.find((m) => matchSlug(m) === slug)
}

export function formatMatchDateLong(d: string): string {
    return new Date(d).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

export function seasonLabel(season: number): string {
    return `${season - 1}-${String(season).slice(-2)}`
}

// Convert a full Sanity season label like "2025-2026" to the closing year
// ("2026") used as the URL segment for /standings/[season].
export function seasonYearForUrl(label: string): string {
    const range = label.match(/(\d{4})\s*-\s*(\d{4})/)
    if (range) return range[2]
    const single = label.match(/\d{4}/)
    return single ? single[0] : label
}

export function opponentOf(m: { homeTeam: string; awayTeam: string }): string {
    return isClaymores(m.homeTeam) ? m.awayTeam : m.homeTeam
}

export function isHomeMatch(m: { homeTeam: string }): boolean {
    return isClaymores(m.homeTeam)
}

export function claymoresScore(m: SanityMatch): { ours: number; theirs: number } {
    return isHomeMatch(m)
        ? { ours: m.homeScore ?? 0, theirs: m.awayScore ?? 0 }
        : { ours: m.awayScore ?? 0, theirs: m.homeScore ?? 0 }
}

export function matchOutcome(m: SanityMatch): 'win' | 'loss' | 'draw' | 'pending' | 'cancelled' {
    if (m.status === 'cancelled') return 'cancelled'
    if (m.status === 'upcoming') return 'pending'
    if (m.status === 'forfeit_us') return 'loss'
    if (m.status === 'forfeit_them') return 'win'
    const { ours, theirs } = claymoresScore(m)
    if (ours > theirs) return 'win'
    if (ours < theirs) return 'loss'
    return 'draw'
}

// ---------------------------------------------------------------------------
// Auto-generated match summary (used when editor hasn't written a recap)
// ---------------------------------------------------------------------------
export function autoMatchSummary(m: SanityMatch): string {
    const opp = opponentOf(m)
    const home = isHomeMatch(m)
    const dateStr = formatMatchDateLong(m.date)
    const venue = m.venue ?? (home ? 'Barnett Park in Orlando, FL' : `${opp}'s home ground`)
    const comp = m.competition ?? (m.matchType === 'friendly' ? 'a friendly' : 'Florida Rugby Union league play')

    if (m.status === 'upcoming') {
        return `The ${CLUB_NAME} face ${opp} on ${dateStr}${m.kickoffTime ? ` at ${m.kickoffTime}` : ''} at ${venue} as part of ${comp}. The Claymores compete in USA Rugby D3 through the Florida Rugby Union — full match details and the latest team news are available on the Claymores' fixtures page.`
    }

    if (m.status === 'cancelled') {
        return `The ${CLUB_NAME}' scheduled match against ${opp} on ${dateStr} was cancelled. Stay up to date with the latest Orlando rugby fixtures on the Claymores' schedule page.`
    }

    if (m.status === 'forfeit_us') {
        return `The ${CLUB_NAME}' match against ${opp} on ${dateStr} was recorded as a forfeit by the Claymores. The full season record is available on the Claymores' results page.`
    }

    if (m.status === 'forfeit_them') {
        return `The ${CLUB_NAME} were awarded a forfeit win against ${opp} on ${dateStr}. The full season record is available on the Claymores' results page.`
    }

    // played
    const { ours, theirs } = claymoresScore(m)
    const outcome = matchOutcome(m)
    const verb = outcome === 'win' ? 'defeated' : outcome === 'loss' ? 'fell to' : 'drew with'
    return `The ${CLUB_NAME} ${verb} ${opp} ${ours}–${theirs} on ${dateStr} at ${venue}, in ${comp}. The Central Florida Claymores RFC are Orlando's USA Rugby D3 club competing in the Florida Rugby Union.`
}

// ---------------------------------------------------------------------------
// JSON-LD builders
// ---------------------------------------------------------------------------

export function breadcrumbSchema(items: { name: string; path: string }[]): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.name,
            item: abs(item.path),
        })),
    }
}

export function articleSchema(post: SanityPost): Record<string, unknown> {
    const url = abs(`/blog/${post.slug.current}`)
    return {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: post.title,
        description: post.excerpt ?? `${post.title} — ${CLUB_NAME} Orlando rugby news.`,
        image: post.coverImageUrl ? [post.coverImageUrl] : [abs('/assets/logo.png')],
        datePublished: post.publishedAt,
        dateModified: post._updatedAt ?? post.publishedAt,
        author: {
            '@type': 'Organization',
            name: CLUB_NAME,
            url: SITE_URL,
        },
        publisher: {
            '@type': 'Organization',
            name: CLUB_NAME,
            url: SITE_URL,
            logo: {
                '@type': 'ImageObject',
                url: abs('/assets/logo.png'),
            },
        },
    }
}

export function athleteSchema(player: SanityPlayer): Record<string, unknown> {
    const url = abs(`/team/${player.slug}`)
    return {
        '@context': 'https://schema.org',
        '@type': ['Person', 'Athlete'],
        name: player.name,
        url,
        ...(player.imageUrl ? { image: player.imageUrl } : {}),
        ...(player.description ? { description: player.description } : {}),
        memberOf: {
            '@type': 'SportsOrganization',
            name: CLUB_NAME,
            url: SITE_URL,
        },
        ...(player.position
            ? {
                  affiliation: {
                      '@type': 'SportsOrganization',
                      name: CLUB_NAME,
                      url: SITE_URL,
                  },
                  knowsAbout: [`Rugby Union — ${player.position}`],
              }
            : {}),
    }
}

export function coachSchema(coach: SanityCoach): Record<string, unknown> {
    const url = abs(`/coaches/${coach.slug}`)
    return {
        '@context': 'https://schema.org',
        '@type': ['Person', 'SportsCoach'],
        name: coach.name,
        url,
        jobTitle: coach.role,
        ...(coach.imageUrl ? { image: coach.imageUrl } : {}),
        ...(coach.bio ? { description: coach.bio } : {}),
        worksFor: {
            '@type': 'SportsOrganization',
            name: CLUB_NAME,
            url: SITE_URL,
        },
    }
}

// SportsEvent — Google rich result for matches.
// docs: https://developers.google.com/search/docs/appearance/structured-data/event
export function sportsEventSchema(m: SanityMatch): Record<string, unknown> {
    const slug = matchSlug(m)
    const url = abs(`/fixtures/${slug}`)
    const opp = opponentOf(m)
    const dateStr = formatMatchDateLong(m.date)
    const startDate = m.kickoffTime ? `${m.date}T${parseKickoff(m.kickoffTime)}-04:00` : m.date

    const eventStatus =
        m.status === 'cancelled'
            ? 'https://schema.org/EventCancelled'
            : m.status === 'upcoming'
            ? 'https://schema.org/EventScheduled'
            : 'https://schema.org/EventScheduled'

    return {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: `${m.homeTeam} vs ${m.awayTeam}`,
        description: autoMatchSummary(m),
        startDate,
        eventStatus,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        url,
        sport: 'Rugby Union',
        location: {
            '@type': 'Place',
            name: m.venue ?? (isHomeMatch(m) ? 'Barnett Park' : `${opp} home ground`),
            address: isHomeMatch(m)
                ? {
                      '@type': 'PostalAddress',
                      streetAddress: '4801 W Colonial Dr',
                      addressLocality: 'Orlando',
                      addressRegion: 'FL',
                      postalCode: '32808',
                      addressCountry: 'US',
                  }
                : undefined,
        },
        homeTeam: {
            '@type': 'SportsTeam',
            name: m.homeTeam,
            ...(m.homeTeamLogo ? { logo: m.homeTeamLogo } : {}),
        },
        awayTeam: {
            '@type': 'SportsTeam',
            name: m.awayTeam,
            ...(m.awayTeamLogo ? { logo: m.awayTeamLogo } : {}),
        },
        organizer: {
            '@type': 'SportsOrganization',
            name: 'Florida Rugby Union',
            url: 'https://rugbyfl.com',
        },
        ...(m.status === 'played' || m.status === 'forfeit_us' || m.status === 'forfeit_them'
            ? {
                  identifier: slug,
                  about: `${m.homeTeam} ${m.homeScore}–${m.awayScore} ${m.awayTeam} on ${dateStr}.`,
              }
            : {}),
    }
}

// "1:00 PM" -> "13:00:00"
function parseKickoff(s: string): string {
    const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
    if (!m) return '12:00:00'
    let hour = parseInt(m[1], 10)
    const min = m[2] ? parseInt(m[2], 10) : 0
    const mer = (m[3] ?? '').toLowerCase()
    if (mer === 'pm' && hour < 12) hour += 12
    if (mer === 'am' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

export function sportsTeamSchema(team: SanityTeam): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name: team.name,
        sport: 'Rugby Union',
        ...(team.logoUrl ? { logo: team.logoUrl } : {}),
        ...(team.website ? { url: team.website } : {}),
        ...(team.city
            ? {
                  location: {
                      '@type': 'Place',
                      address: { '@type': 'PostalAddress', addressLocality: team.city },
                  },
              }
            : {}),
        ...(team.description ? { description: team.description } : {}),
    }
}

// Sports facility used on /location for "rugby fields Orlando" type queries.
// Sourced from the practiceSchedule singleton so it stays accurate when the
// venue changes seasonally.
export function placeSchema(schedule: PracticeSchedule): Record<string, unknown> {
    const hours = parseTimeRange(schedule.time)
    const dayOfWeek = WEEKDAY_TO_SCHEMA[schedule.weekday] ?? schedule.weekday
    return {
        '@context': 'https://schema.org',
        '@type': 'SportsActivityLocation',
        name: `${schedule.venueName} — Central Florida Claymores RFC Practice Field`,
        url: abs('/location'),
        address: {
            '@type': 'PostalAddress',
            streetAddress: schedule.venueStreet,
            addressLocality: schedule.venueCity,
            addressRegion: schedule.venueRegion,
            postalCode: schedule.venuePostalCode,
            addressCountry: 'US',
        },
        sport: 'Rugby Union',
        ...(hours
            ? {
                  openingHoursSpecification: [
                      {
                          '@type': 'OpeningHoursSpecification',
                          dayOfWeek,
                          opens: hours.opens,
                          closes: hours.closes,
                      },
                  ],
              }
            : {}),
    }
}
