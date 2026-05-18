import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')

    if (secret !== process.env.SANITY_REVALIDATE_SECRET) {
        return NextResponse.json({ message: 'Invalid secret' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const type = body?._type

    // Revalidate relevant paths based on document type
    if (type === 'post') {
        revalidatePath('/blog')
        revalidatePath('/blog/[slug]', 'page')
    } else if (type === 'player') {
        revalidatePath('/team')
    } else if (type === 'match') {
        revalidatePath('/fixtures')
        revalidatePath('/results')
        revalidatePath('/standings')
        revalidatePath('/standings/[season]', 'page')
    } else if (type === 'practice') {
        revalidatePath('/fixtures')
    } else if (type === 'practiceSchedule') {
        // Schedule appears in copy/schema on virtually every page — revalidate everything.
        revalidatePath('/', 'layout')
    } else if (type === 'leagueStandings' || type === 'leagueChampionship') {
        // Standings render on the homepage (left rail), /standings, and /standings/[season].
        revalidatePath('/')
        revalidatePath('/standings')
        revalidatePath('/standings/[season]', 'page')
    } else {
        // Fallback: revalidate everything
        revalidatePath('/', 'layout')
    }

    return NextResponse.json({ revalidated: true, type })
}
