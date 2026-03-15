import { createClient } from '@sanity/client'

const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN!,
    useCdn: false,
})

async function run() {
    const matches: { _id: string; homeTeam: string; awayTeam: string }[] = await client.fetch(
        `*[_type == "match"] { _id, homeTeam, awayTeam }`
    )

    const toDelete = matches.filter(m =>
        !/claymore/i.test(m.homeTeam) && !/claymore/i.test(m.awayTeam)
    )

    if (toDelete.length === 0) {
        console.log('No non-Claymores matches found.')
        return
    }

    console.log(`Deleting ${toDelete.length} non-Claymores matches...`)
    for (const m of toDelete) {
        await client.delete(m._id)
        console.log(`  ✓ Deleted: ${m.homeTeam} vs ${m.awayTeam}`)
    }
    console.log('Done.')
}

run().catch(console.error)
