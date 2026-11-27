/**
 * One way to write a time across the site: "8:00 PM", "8:00 PM – 10:00 PM".
 * Sanity and rugbyfl.com hand us "1:00pm", "2:00 PM", "8:00PM - 10:00PM" and
 * "8–10pm"; anything we can't read is returned as it came.
 */
const ONE = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i
const RANGE = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i

function clock(hour: string, minute: string | undefined, meridiem: string): string {
    return `${Number(hour)}:${minute ?? '00'} ${meridiem.toUpperCase()}M`
}

export function formatTime(value: string): string
export function formatTime(value: string | null | undefined): string | undefined
export function formatTime(value: string | null | undefined): string | undefined {
    if (!value) return value ?? undefined
    const text = value.trim()
    const one = text.match(ONE)
    if (one) return clock(one[1], one[2], one[3])
    const range = text.match(RANGE)
    if (range) {
        // "8–10pm": the first time takes the second one's am/pm.
        return `${clock(range[1], range[2], range[3] ?? range[6])} – ${clock(range[4], range[5], range[6])}`
    }
    return value
}
