import 'server-only'

import { cache } from 'react'
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

const baseUrl = process.env.CLAYMORES_API_BASE_URL?.trim()
export const usesClaymoresApi = Boolean(baseUrl)

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

async function apiGet<T>(path: string, tag: CacheTag): Promise<T>
async function apiGet<T>(path: string, tag: CacheTag, allowMissing: true): Promise<T | null>
async function apiGet<T>(path: string, tag: CacheTag, allowMissing = false): Promise<T | null> {
    if (!baseUrl) throw new Error('CLAYMORES_API_BASE_URL is missing')
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        next: { revalidate: 3600, tags: [tag] },
    })
    if (allowMissing && response.status === 404) return null
    if (!response.ok) throw new Error(`Claymores API GET ${path} returned ${response.status}`)
    return response.json() as Promise<T>
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

export const getMatches = cache(async (): Promise<SanityMatch[]> => {
    if (!usesClaymoresApi) return client.fetch(matchesQuery)
    const fixtures = await apiGet<ApiFixture[]>('/v1/fixtures', sportsCacheTags.fixtures)
    return fixtures.map(mapFixture)
})

export const getMatchForSlug = cache(async (slug: string): Promise<SanityMatch | null> => {
    const match = (await getMatches()).find(candidate => matchSlug(candidate) === slug)
    if (!match || !usesClaymoresApi) return match ?? null

    const detail = await apiGet<ApiFixture>(
        `/v1/fixtures/${encodeURIComponent(match._id)}`,
        sportsCacheTags.fixtures,
        true,
    )
    return detail ? mapFixture(detail) : null
})

export const getTeams = cache(async (): Promise<SanityTeam[]> => {
    if (!usesClaymoresApi) return client.fetch(teamsQuery)
    const teams = await apiGet<ApiDocument<SanityTeam>[]>('/v1/teams', sportsCacheTags.teams)
    return teams.map(team => mapDocument(team))
})

export const getTeamForSlug = cache(async (slug: string): Promise<SanityTeam | null> => {
    if (!usesClaymoresApi) return client.fetch(teamBySlugQuery, { slug })
    return (await getTeams()).find(team => team.slug === slug) ?? null
})

export const getPractices = cache(async (): Promise<SanityPractice[]> => {
    if (!usesClaymoresApi) return client.fetch(practicesQuery)
    const practices = await apiGet<ApiDocument<SanityPractice>[]>('/v1/practices', sportsCacheTags.practices)
    return practices.map(practice => mapDocument(practice))
})

export const getPlayers = cache(async (): Promise<SanityPlayer[]> => {
    if (!usesClaymoresApi) return client.fetch(playersQuery)
    const players = await apiGet<ApiDocument<SanityPlayer>[]>('/v1/players', sportsCacheTags.players)
    return players.map(player => mapDocument(player))
})

export const getPlayerForSlug = cache(async (slug: string): Promise<SanityPlayer | null> => {
    if (!usesClaymoresApi) return client.fetch(playerBySlugQuery, { slug })
    const player = await apiGet<ApiDocument<SanityPlayer>>(
        `/v1/players/${encodeURIComponent(slug)}`,
        sportsCacheTags.players,
        true,
    )
    return player ? mapDocument(player) : null
})

export const getPracticeScheduleDocument = cache(async (): Promise<SanityPracticeSchedule | null> => {
    if (!usesClaymoresApi) return client.fetch(practiceScheduleQuery)
    return apiGet<SanityPracticeSchedule>('/v1/practices/schedule', sportsCacheTags.practices, true)
})

export const getLeagueStandings = cache(async (seasonLabel?: string): Promise<SanityLeagueStandings | null> => {
    if (!usesClaymoresApi) {
        return seasonLabel
            ? client.fetch(leagueStandingsBySeasonQuery, { seasonLabel })
            : client.fetch(currentLeagueStandingsQuery)
    }

    const season = seasonLabel ? `?season=${encodeURIComponent(seasonLabel)}` : ''
    const standings = await apiGet<ApiDocument<SanityLeagueStandings>>(
        `/v1/standings${season}`,
        sportsCacheTags.standings,
        true,
    )
    return standings ? mapDocument(standings) : null
})

export const getStandingsIndex = cache(async (): Promise<SanityStandingsIndexEntry[]> => {
    if (!usesClaymoresApi) return client.fetch(standingsIndexQuery)
    return apiGet<SanityStandingsIndexEntry[]>('/v1/standings/seasons', sportsCacheTags.standings)
})

export const getSeasonDivisions = cache(async (): Promise<SanitySeasonDivision[]> => {
    if (!usesClaymoresApi) return client.fetch(seasonDivisionsQuery)
    const seasons = await getStandingsIndex()
    return seasons.map(({ seasonLabel, divisionName }) => ({ seasonLabel, divisionName }))
})
