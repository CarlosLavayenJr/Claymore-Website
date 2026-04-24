import { createClient } from '@sanity/client'

// Backfills the `slug` field on every Sanity `team` document that doesn't
// already have one. Slug is generated from the team's `name`. After running,
// every opponent on /opponents that has a team doc becomes clickable
// through to /opponents/[slug].
//
// Usage:
//   SANITY_API_TOKEN=... npx tsx scripts/backfill-team-slugs.ts
//
// Idempotent — teams with an existing slug are skipped.

const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID ?? 'bw1seoll',
    dataset: process.env.SANITY_DATASET ?? 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
})

function slugify(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96)
}

interface TeamDoc {
    _id: string
    name: string
    slug?: { current?: string } | null
}

async function main() {
    if (!process.env.SANITY_API_TOKEN) {
        console.error('SANITY_API_TOKEN env var is required (Sanity → Manage → API → Tokens, "Editor" or "Write")')
        process.exit(1)
    }

    const teams: TeamDoc[] = await client.fetch(`*[_type == "team"]{ _id, name, slug }`)
    console.log(`Found ${teams.length} team docs.`)

    const seen = new Map<string, string>() // slug -> team _id
    let updated = 0
    let skipped = 0
    let conflicts = 0

    // Pre-populate seen with already-set slugs so we don't collide
    for (const t of teams) {
        const existing = t.slug?.current
        if (existing) seen.set(existing, t._id)
    }

    for (const t of teams) {
        if (t.slug?.current) {
            skipped++
            continue
        }
        let base = slugify(t.name || '')
        if (!base) {
            console.warn(`✗ ${t._id}: no usable name, skipping`)
            continue
        }
        let slug = base
        let n = 2
        while (seen.has(slug) && seen.get(slug) !== t._id) {
            slug = `${base}-${n++}`
            conflicts++
        }
        seen.set(slug, t._id)

        try {
            await client.patch(t._id).set({ slug: { _type: 'slug', current: slug } }).commit()
            console.log(`✓ ${t.name}  →  ${slug}`)
            updated++
        } catch (err) {
            console.error(`✗ ${t.name}:`, err)
        }
    }

    console.log(`\nDone. Updated ${updated}, skipped ${skipped} (already had slug), resolved ${conflicts} conflicts.`)
}

main()
