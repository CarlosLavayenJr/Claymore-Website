// Member sign-in is gated on env presence so production never breaks when
// the Google client, Auth.js secret, or Claymores API URL is not configured.
// When any is missing, sign-in links are hidden and the member pages show a
// "coming soon" state. No `server-only` import so tests and proxy.ts can use it.

type Env = Record<string, string | undefined>

const REQUIRED = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'AUTH_SECRET', 'CLAYMORES_API_BASE_URL'] as const

function has(env: Env, key: string) {
    return Boolean(env[key]?.trim())
}

export function memberAuthEnabled(env: Env = process.env): boolean {
    return REQUIRED.every(key => has(env, key))
}

/**
 * Local-only test sign-in (an email form instead of Google) for running the
 * site against the mock API. Never on in a production build: `next build`
 * sets NODE_ENV=production.
 */
export function devSignInEnabled(env: Env = process.env): boolean {
    return env.NODE_ENV === 'development' && env.CLAYMORES_DEV_SIGN_IN === '1' && memberAuthEnabled(env)
}

/**
 * Web Stripe checkout needs the API to return players to the website rather
 * than to the app's `Stripe:AppReturnUrl`. Until the API supports a web
 * return URL, the pay button stays hidden unless this flag is set.
 */
export function webCheckoutEnabled(env: Env = process.env): boolean {
    return env.CLAYMORES_WEB_CHECKOUT_ENABLED === 'true' || env.CLAYMORES_WEB_CHECKOUT_ENABLED === '1'
}

export function apiBaseUrl(env: Env = process.env): string {
    const value = env.CLAYMORES_API_BASE_URL?.trim()
    if (!value) throw new Error('CLAYMORES_API_BASE_URL is missing')
    return value.replace(/\/+$/, '')
}

/** Name of the non-httpOnly hint cookie the navbar reads to show "Account". It carries no token. */
export const SIGNED_IN_HINT_COOKIE = 'claymores_member'
