// Where public sports data (fixtures, standings, teams, players, practices)
// is read from. Kept separate from member sign-in: CLAYMORES_API_BASE_URL only
// says where the API lives, CLAYMORES_DATA_SOURCE=api opts sports pages in.
// No `server-only` import so it can be unit tested.

type Env = Record<string, string | undefined>

export type SportsDataSource = 'api' | 'sanity'

/** Sports data reads the API only with CLAYMORES_DATA_SOURCE=api and an API URL; anything else is Sanity. */
export function sportsDataSource(env: Env = process.env): SportsDataSource {
    const choice = env.CLAYMORES_DATA_SOURCE?.trim().toLowerCase()
    return choice === 'api' && Boolean(env.CLAYMORES_API_BASE_URL?.trim()) ? 'api' : 'sanity'
}

/** Default timeout for a public sports-data read from the API. */
export const SPORTS_API_TIMEOUT_MS = 8_000

/** The API could not answer (network error, timeout, 5xx, unreadable body): safe to fall back to Sanity. */
export class ApiUnavailableError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'ApiUnavailableError'
    }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ApiJsonOptions = {
    fetch?: FetchLike
    init?: RequestInit
    timeoutMs?: number
    /** Return null for a 404 instead of throwing. */
    allowMissing?: boolean
}

export async function fetchApiJson<T>(url: string, options: ApiJsonOptions = {}): Promise<T | null> {
    const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    const label = `GET ${new URL(url).pathname}`
    let response: Response
    try {
        response = await fetchImpl(url, {
            ...options.init,
            signal: AbortSignal.timeout(options.timeoutMs ?? SPORTS_API_TIMEOUT_MS),
        })
    } catch (error) {
        throw new ApiUnavailableError(`${label} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    if (options.allowMissing && response.status === 404) return null
    if (response.status >= 500) throw new ApiUnavailableError(`${label} returned ${response.status}`)
    if (!response.ok) throw new Error(`Claymores API ${label} returned ${response.status}`)
    try {
        return (await response.json()) as T
    } catch (error) {
        throw new ApiUnavailableError(`${label} returned an unreadable body`, { cause: error })
    }
}

/**
 * Runs the API read; when the API is unavailable, logs a warning and runs the
 * Sanity read instead so pages (and the build) keep working.
 */
export async function withSanityFallback<T>(
    label: string,
    apiRead: () => Promise<T>,
    sanityRead: () => Promise<T>,
    warn: (message: string) => void = console.warn,
): Promise<T> {
    try {
        return await apiRead()
    } catch (error) {
        if (!(error instanceof ApiUnavailableError)) throw error
        warn(`[claymores-api] ${label}: ${error.message}. Falling back to Sanity.`)
        return sanityRead()
    }
}
