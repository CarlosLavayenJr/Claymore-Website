// The club's fixtures as a calendar to subscribe to: webcal://www.claymoresrfc.com/calendar.ics.
// The API builds it (GET /v1/calendar.ics); this keeps the address on the club's own domain.

export const revalidate = 3600

export async function GET() {
    const base = process.env.CLAYMORES_API_BASE_URL?.trim().replace(/\/+$/, '')
    if (!base) return new Response('Calendar unavailable', { status: 503 })
    const response = await fetch(`${base}/v1/calendar.ics`, { next: { revalidate: 3600 } }).catch(() => null)
    if (!response?.ok) return new Response('Calendar unavailable', { status: 502 })
    return new Response(await response.text(), {
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'inline; filename="claymores-fixtures.ics"',
            'Cache-Control': 'public, max-age=3600',
        },
    })
}
