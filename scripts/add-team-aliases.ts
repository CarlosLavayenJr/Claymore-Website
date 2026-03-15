import { createClient } from '@sanity/client'

const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN!,
    useCdn: false,
})

const aliasMap: Record<string, string[]> = {
    'Fort Lauderdale RFC':   ['Ft. Lauderdale', 'Fort Lauderdale'],
    'Tallahassee Rugby':     ['Tallahassee', 'FSU B', 'FSU'],
    'Daytona Coconuts':      ['Daytona'],
    'Lakeland Lancers':      ['Lakeland'],
    'Jacksonville Rugby':    ['Jacksonville', 'Jacksonville D3', 'Jacksonville D4'],
    'St Pete Pelicans':      ['Pelicans', 'Pelicans D3'],
    'Orlando Griffins':      ['Orlando D4', 'Orlando D3'],
    'Orlando Otters':        ['Orlando Otters'],
    'Brevard Red Eyes':      ['Brevard'],
    'Okapi Wanderers':       ['Okapi'],
    'Gainesville Hogs':      ['Gainesville'],
    'Sarasota Rugby Club':   ['Sarasota'],
    'Treasure Coast Armada': ['Treasure Coast'],
}

async function run() {
    const teams: { _id: string; name: string }[] = await client.fetch(
        `*[_type == "team"] { _id, name }`
    )

    for (const team of teams) {
        const aliases = aliasMap[team.name]
        if (!aliases) {
            console.log(`  skipping: ${team.name} (no aliases defined)`)
            continue
        }
        await client.patch(team._id).set({ aliases }).commit()
        console.log(`  ✓ ${team.name} → [${aliases.join(', ')}]`)
    }
    console.log('Done.')
}

run().catch(console.error)
