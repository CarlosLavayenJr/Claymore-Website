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
    } else {
        // Fallback: revalidate everything
        revalidatePath('/', 'layout')
    }

    return NextResponse.json({ revalidated: true, type })
}
