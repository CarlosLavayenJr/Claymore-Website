// Feature flags for in-progress sections of the site.
//
// Each flag reads from a NEXT_PUBLIC_* env var so it can be toggled at deploy
// time (Vercel → Project → Settings → Environment Variables) without a code
// change, but defaults are encoded here for safety.
//
// To enable a flag locally:  add NEXT_PUBLIC_<FLAG>=true to .env.local
// To enable in production:   set NEXT_PUBLIC_<FLAG>=true in Vercel env vars

function flag(envValue: string | undefined, defaultValue: boolean): boolean {
    if (envValue === undefined || envValue === '') return defaultValue
    return envValue === 'true' || envValue === '1'
}

export const features = {
    // /coaches index + /coaches/[slug] pages.
    // Default OFF until the coach docs are seeded in Sanity (see
    // scripts/seed-coaches.ts) and have photos uploaded.
    coaches: flag(process.env.NEXT_PUBLIC_COACHES_ENABLED, false),

    // Homepage Upcoming Events calendar widget (desktop right rail + mobile
    // section after "From the Field"). Default OFF until the league table is
    // built so the hero section doesn't ship lopsided.
    homepageCalendar: flag(process.env.NEXT_PUBLIC_HOMEPAGE_CALENDAR_ENABLED, false),
} as const
