import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

type PathSpec = [path: string, type?: 'page' | 'layout']

// Every route that reads matches via `matchesQuery`. Keep this in sync with
// the `client.fetch(matchesQuery)` call sites in app/ — a doc type that
// revalidates an incomplete list silently serves stale content until the
// page's own `export const revalidate` window expires (an hour on most pages).
const MATCH_PATHS: PathSpec[] = [
    ['/'], // homepage hero copy + UpcomingEvents rail
    ['/fixtures'],
    ['/fixtures/[slug]', 'page'],
    ['/results'],
    ['/standings'],
    ['/standings/[season]', 'page'],
    ['/opponents'],
    ['/opponents/[slug]', 'page'],
    ['/sitemap.xml'],
]

// Practices render in the fixtures calendar *and* the homepage events rail.
const PRACTICE_PATHS: PathSpec[] = [['/'], ['/fixtures']]

const POST_PATHS: PathSpec[] = [['/blog'], ['/blog/[slug]', 'page'], ['/sitemap.xml']]

const PLAYER_PATHS: PathSpec[] = [['/team'], ['/team/[slug]', 'page'], ['/sitemap.xml']]

const STANDINGS_PATHS: PathSpec[] = [
    ['/'], // standings render in the homepage left rail
    ['/standings'],
    ['/standings/[season]', 'page'],
]

// The practice schedule singleton feeds copy and structured data on nearly
// every page, so purge the whole tree rather than trying to enumerate it.
const EVERYTHING: PathSpec[] = [['/', 'layout'], ['/sitemap.xml']]

const PATHS_BY_TYPE: Record<string, PathSpec[]> = {
    post: POST_PATHS,
    player: PLAYER_PATHS,
    match: MATCH_PATHS,
    practice: PRACTICE_PATHS,
    practiceSchedule: EVERYTHING,
    leagueStandings: STANDINGS_PATHS,
    leagueChampionship: STANDINGS_PATHS,
}

function revalidate(specs: PathSpec[]): string[] {
    for (const [path, type] of specs) {
        revalidatePath(path, type)
    }
    return specs.map(([path, type]) => (type ? `${path} (${type})` : path))
}

export async function POST(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')

    if (secret !== process.env.SANITY_REVALIDATE_SECRET) {
        return NextResponse.json({ message: 'Invalid secret' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const type: string | undefined = body?._type

    // Unknown or missing type (e.g. a webhook projection that drops `_type`)
    // falls back to purging everything — stale pages are worse than a cold cache.
    const revalidated = revalidate((type && PATHS_BY_TYPE[type]) || EVERYTHING)

    // Shows up in the Vercel function logs, so "did the webhook actually fire?"
    // is answerable without guessing.
    console.log(`[revalidate] _type=${type ?? 'unknown'} paths=${revalidated.join(', ')}`)

    return NextResponse.json({ revalidated: true, type: type ?? null, paths: revalidated })
}

// Health check for debugging the webhook: confirms the route is deployed and
// the secret matches, without touching the cache.
export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    const configured = Boolean(process.env.SANITY_REVALIDATE_SECRET)

    if (!configured) {
        return NextResponse.json(
            { ok: false, message: 'SANITY_REVALIDATE_SECRET is not set on this deployment' },
            { status: 500 },
        )
    }
    if (secret !== process.env.SANITY_REVALIDATE_SECRET) {
        return NextResponse.json({ ok: false, message: 'Invalid secret' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, knownTypes: Object.keys(PATHS_BY_TYPE) })
}
