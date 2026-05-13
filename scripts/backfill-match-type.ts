import { createClient } from '@sanity/client'

// Backfills the `matchType` field on every Sanity `match` document that
// doesn't already have one. Per request, missing matchType is assumed to be
// `friendly` so the editor can flip the obvious league games manually in
// Studio (or this can be re-run with --league once those are tagged).
//
// Usage:
//   SANITY_API_TOKEN=... npx tsx scripts/backfill-match-type.ts
//   SANITY_API_TOKEN=... npx tsx scripts/backfill-match-type.ts --dry-run
//
// Idempotent — matches with an existing matchType are skipped.

const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID ?? 'bw1seoll',
    dataset: process.env.SANITY_DATASET ?? 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
})

interface MatchDoc {
    _id: string
    date: string
    homeTeam: string
    awayTeam: string
    matchType?: 'league' | 'friendly'
}

async function main() {
    const dryRun = process.argv.includes('--dry-run')

    if (!process.env.SANITY_API_TOKEN && !dryRun) {
        console.error('SANITY_API_TOKEN env var is required (Sanity → Manage → API → Tokens, "Editor" or "Write")')
        process.exit(1)
    }

    const matches: MatchDoc[] = await client.fetch(
        `*[_type == "match"]{ _id, date, homeTeam, awayTeam, matchType } | order(date asc)`,
    )
    console.log(`Found ${matches.length} match docs.`)

    const missing = matches.filter((m) => !m.matchType)
    console.log(`${missing.length} are missing matchType — will set to "friendly".`)

    if (dryRun) {
        for (const m of missing) {
            console.log(`  [dry-run] ${m.date}  ${m.homeTeam} vs ${m.awayTeam}`)
        }
        console.log(`\nDone (dry-run). No changes written.`)
        return
    }

    let updated = 0
    for (const m of missing) {
        try {
            await client.patch(m._id).set({ matchType: 'friendly' }).commit()
            console.log(`✓ ${m.date}  ${m.homeTeam} vs ${m.awayTeam}  →  friendly`)
            updated++
        } catch (err) {
            console.error(`✗ ${m._id}:`, err)
        }
    }

    console.log(
        `\nDone. Updated ${updated}, skipped ${matches.length - missing.length} (already had matchType).`,
    )
}

main()
