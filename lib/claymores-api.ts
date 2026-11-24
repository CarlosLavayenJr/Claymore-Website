import 'server-only'

import { cache } from 'react'
import { ApiUnavailableError, fetchApiJson, sportsDataSource, withSanityFallback } from '@/lib/claymores/data-source'
import { matchSlug } from '@/lib/seo'
import { client } from '@/sanity/lib/client'
import {
    currentLeagueStandingsQuery,
    leagueStandingsBySeasonQuery,
    matchesQuery,
    playerBySlugQuery,
    playersQuery,
    practicesQuery,
    practiceScheduleQuery,
    seasonDivisionsQuery,
    standingsIndexQuery,
    teamBySlugQuery,
    teamsQuery,
    type SanityLeagueStandings,
    type SanityMatch,
    type SanityPlayer,
    type SanityPractice,
    type SanityPracticeSchedule,
    type SanitySeasonDivision,
    type SanityStandingsIndexEntry,
    type SanityTeam,
} from '@/sanity/lib/queries'

const baseUrl = process.env.CLAYMORES_API_BASE_URL?.trim().replace(/\/+$/, '')

/**
 * True when public sports data reads the API (CLAYMORES_DATA_SOURCE=api plus
 * CLAYMORES_API_BASE_URL). Otherwise, and whenever the API is unavailable,
 * it reads Sanity. Member sign-in uses the API URL on its own and never flips this.
 */
export const usesClaymoresApi = sportsDataSource() === 'api'

export const sportsCacheTags = {
    fixtures: 'claymores-api:fixtures',
    standings: 'claymores-api:standings',
    teams: 'claymores-api:teams',
    practices: 'claymores-api:practices',
    players: 'claymores-api:players',
} as const

type CacheTag = (typeof sportsCacheTags)[keyof typeof sportsCacheTags]
type ApiIdentity = {
    id: string
    updatedAt?: string | null
}
type ApiDocument<T> = Omit<T, '_id' | '_updatedAt'> & ApiIdentity
type ApiFixture = Omit<ApiDocument<SanityMatch>, 'homeTeamLogo' | 'awayTeamLogo'> & {
    homeLogo?: string | null
    awayLogo?: string | null
}

// Network errors, timeouts (8s) and 5xx throw ApiUnavailableError; the readers
// below turn that into a Sanity read so pages and the build survive an API outage.
async function apiGet<T>(path: string, tag: CacheTag): Promise<T>
async function apiGet<T>(path: string, tag: CacheTag, allowMissing: true): Promise<T | null>
async function apiGet<T>(path: string, tag: CacheTag, allowMissing = false): Promise<T | null> {
    if (!baseUrl) throw new ApiUnavailableError('CLAYMORES_API_BASE_URL is missing')
    const data = await fetchApiJson<T>(`${baseUrl}${path}`, {
        init: { next: { revalidate: 3600, tags: [tag] } },
        allowMissing,
    })
    if (!allowMissing && data === null) throw new ApiUnavailableError(`GET ${path} returned no data`)
    return data
}

/** Reads the API when it is the data source, falling back to Sanity when it is unavailable. */
function read<T>(label: string, apiRead: () => Promise<T>, sanityRead: () => Promise<T>): Promise<T> {
    if (!usesClaymoresApi) return sanityRead()
    return withSanityFallback(label, apiRead, sanityRead)
}

function mapDocument<T>(document: T & ApiIdentity) {
    const { id, updatedAt, ...fields } = document
    return { ...fields, _id: id, _updatedAt: updatedAt ?? undefined }
}

function mapFixture(fixture: ApiFixture): SanityMatch {
    const { homeLogo, awayLogo, ...fields } = fixture
    return mapDocument({
        ...fields,
        homeTeamLogo: homeLogo,
        awayTeamLogo: awayLogo,
    })
}

export const getMatches = cache(async (): Promise<SanityMatch[]> => read(
    'fixtures',
    async () => (await apiGet<ApiFixture[]>('/v1/fixtures', sportsCacheTags.fixtures)).map(mapFixture),
    () => client.fetch(matchesQuery),
))

export const getMatchForSlug = cache(async (slug: string): Promise<SanityMatch | null> => {
    const match = (await getMatches()).find(candidate => matchSlug(candidate) === slug)
    if (!match || !usesClaymoresApi) return match ?? null

    // The list already has the match; when the detail call is unavailable, show the list entry.
    return read(
        `fixture ${match._id}`,
        async () => {
            const detail = await apiGet<ApiFixture>(
                `/v1/fixtures/${encodeURIComponent(match._id)}`,
                sportsCacheTags.fixtures,
                true,
            )
            return detail ? mapFixture(detail) : null
        },
        async () => match,
    )
})

export const getTeams = cache(async (): Promise<SanityTeam[]> => read(
    'teams',
    async () => (await apiGet<ApiDocument<SanityTeam>[]>('/v1/teams', sportsCacheTags.teams)).map(team => mapDocument(team)),
    () => client.fetch(teamsQuery),
))

export const getTeamForSlug = cache(async (slug: string): Promise<SanityTeam | null> => {
    if (!usesClaymoresApi) return client.fetch(teamBySlugQuery, { slug })
    return (await getTeams()).find(team => team.slug === slug) ?? null
})

export const getPractices = cache(async (): Promise<SanityPractice[]> => read(
    'practices',
    async () => (await apiGet<ApiDocument<SanityPractice>[]>('/v1/practices', sportsCacheTags.practices)).map(practice => mapDocument(practice)),
    () => client.fetch(practicesQuery),
))

export const getPlayers = cache(async (): Promise<SanityPlayer[]> => read(
    'players',
    async () => (await apiGet<ApiDocument<SanityPlayer>[]>('/v1/players', sportsCacheTags.players)).map(player => mapDocument(player)),
    () => client.fetch(playersQuery),
))

export const getPlayerForSlug = cache(async (slug: string): Promise<SanityPlayer | null> => read(
    `player ${slug}`,
    async () => {
        const player = await apiGet<ApiDocument<SanityPlayer>>(
            `/v1/players/${encodeURIComponent(slug)}`,
            sportsCacheTags.players,
            true,
        )
        return player ? mapDocument(player) : null
    },
    () => client.fetch(playerBySlugQuery, { slug }),
))

export const getPracticeScheduleDocument = cache(async (): Promise<SanityPracticeSchedule | null> => read(
    'practice schedule',
    () => apiGet<SanityPracticeSchedule>('/v1/practices/schedule', sportsCacheTags.practices, true),
    () => client.fetch(practiceScheduleQuery),
))

export const getLeagueStandings = cache(async (seasonLabel?: string): Promise<SanityLeagueStandings | null> => read(
    `standings ${seasonLabel ?? 'current'}`,
    async () => {
        const season = seasonLabel ? `?season=${encodeURIComponent(seasonLabel)}` : ''
        const standings = await apiGet<ApiDocument<SanityLeagueStandings>>(
            `/v1/standings${season}`,
            sportsCacheTags.standings,
            true,
        )
        return standings ? mapDocument(standings) : null
    },
    () => seasonLabel
        ? client.fetch(leagueStandingsBySeasonQuery, { seasonLabel })
        : client.fetch(currentLeagueStandingsQuery),
))

export const getStandingsIndex = cache(async (): Promise<SanityStandingsIndexEntry[]> => read(
    'standings seasons',
    () => apiGet<SanityStandingsIndexEntry[]>('/v1/standings/seasons', sportsCacheTags.standings),
    () => client.fetch(standingsIndexQuery),
))

export const getSeasonDivisions = cache(async (): Promise<SanitySeasonDivision[]> => {
    if (!usesClaymoresApi) return client.fetch(seasonDivisionsQuery)
    const seasons = await getStandingsIndex()
    return seasons.map(({ seasonLabel, divisionName }) => ({ seasonLabel, divisionName }))
})
