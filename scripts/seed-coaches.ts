import { createClient } from '@sanity/client'

// Seed initial coach/staff documents in Sanity from the data currently
// hardcoded in app/(site)/about/page.tsx. After running this, the editor
// can manage coaches in the Studio under "Coach / Staff" and the
// /coaches pages will surface them automatically.
//
// Usage:
//   SANITY_API_TOKEN=... npx tsx scripts/seed-coaches.ts

const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID ?? 'bw1seoll',
    dataset: process.env.SANITY_DATASET ?? 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
})

const coaches = [
    {
        _id: 'coach-adam-chivers',
        _type: 'coach',
        name: 'Adam Chivers',
        slug: { _type: 'slug', current: 'adam-chivers' },
        role: 'Head Coach',
        order: 10,
        active: true,
        bio: "Former Claymore player, Adam transitioned into a coaching role as of the 2024 season. Nothing defines a club built by players, for players more than one of your own making the jump to full-time coach.",
        credentials: [
            'Former Claymores player turned head coach',
            'Leads weekly Thursday training in Orlando',
        ],
    },
    {
        _id: 'coach-jamie-moncur',
        _type: 'coach',
        name: 'Jamie Moncur',
        slug: { _type: 'slug', current: 'jamie-moncur' },
        role: 'Founder & Coach',
        order: 20,
        active: true,
        bio: "Jamie Moncur started his rugby journey with 10 years of school boy rugby in Edinburgh, Scotland, followed by a brief coaching stint in The Netherlands. After moving to the USA, he led the University of St. Thomas Celts RFC to significant success, including reaching the Texas State finals in 2009/2010. After a brief hiatus, he returned to coaching with Orlando Rugby in 2016, and in 2018 founded The Claymores, while continuing to develop his coaching expertise through various certifications.",
        credentials: [
            'Founded the Central Florida Claymores RFC in 2018',
            '10 years of schoolboy rugby in Edinburgh, Scotland',
            'Coached University of St. Thomas Celts RFC to the Texas State final (2009/2010)',
            'Multiple coaching certifications',
        ],
    },
    {
        _id: 'coach-alexander-cavanaugh',
        _type: 'coach',
        name: 'Alexander Cavanaugh',
        slug: { _type: 'slug', current: 'alexander-cavanaugh' },
        role: 'President',
        order: 30,
        active: true,
        bio: "A former Mizzou standout, Alex has been a cornerstone of the Claymores' success both on and off the field. As captain, he led the team to a D4 state final and numerous victories. Beyond his playing achievements, Alex has been instrumental in building the club's foundation and establishing structures that will benefit the organization long after he hangs up his boots.",
        credentials: [
            'Former University of Missouri rugby player',
            'Captained the Claymores to the D4 state final (2023)',
            'Club President, Central Florida Claymores RFC',
        ],
    },
]

async function main() {
    if (!process.env.SANITY_API_TOKEN) {
        console.error('SANITY_API_TOKEN env var is required')
        process.exit(1)
    }
    for (const coach of coaches) {
        try {
            await client.createOrReplace(coach)
            console.log(`✓ ${coach.name}`)
        } catch (err) {
            console.error(`✗ ${coach.name}:`, err)
        }
    }
    console.log('Done. Add photos in the Studio under Coach / Staff.')
}

main()
