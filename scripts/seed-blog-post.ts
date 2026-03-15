import { createClient } from '@sanity/client'

const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID ?? 'bw1seoll',
    dataset: process.env.SANITY_DATASET ?? 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
})

const post = {
    _type: 'post',
    title: '2025 Florida Rugby Union Season Preview — Central Florida Claymores RFC',
    slug: { _type: 'slug', current: '2025-florida-rugby-union-season-preview' },
    publishedAt: '2026-03-01T12:00:00Z',
    excerpt: 'The Central Florida Claymores RFC are gearing up for another competitive Florida Rugby Union D3 season. Here\'s what to expect from Orlando\'s rugby club in 2025.',
    body: [
        {
            _type: 'block',
            _key: 'intro',
            style: 'normal',
            children: [{ _type: 'span', _key: 'intro-span', text: 'The Central Florida Claymores RFC are heading into another exciting Florida Rugby Union D3 season, and the squad has never looked more ready. After years of building a competitive roster from across the Orlando area, the Claymores are primed to make their mark in 2025.' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'h2-competition',
            style: 'h2',
            children: [{ _type: 'span', _key: 'h2-competition-span', text: 'D3 Competition in the Florida Rugby Union' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'competition-body',
            style: 'normal',
            children: [{ _type: 'span', _key: 'competition-body-span', text: 'The Florida Rugby Union D3 division is one of the most competitive in the Southeast, with clubs from Tampa, Jacksonville, Fort Lauderdale, and beyond all vying for the top spots. The Claymores have faced every one of these opponents and know what it takes to compete. This season, the focus is on consistency — building on strong performances from recent years and chasing a title run.' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'h2-squad',
            style: 'h2',
            children: [{ _type: 'span', _key: 'h2-squad-span', text: 'A Growing Squad from Across Central Florida' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'squad-body',
            style: 'normal',
            children: [{ _type: 'span', _key: 'squad-body-span', text: 'One of the biggest strengths of the Claymores is the diversity of our squad. Players come from across Central Florida — from Winter Park and Lake Mary to Kissimmee and the UCF area. Many of them had never played rugby before finding us. That mix of experience levels, combined with coaching from players who\'ve been in the game for years, creates something special every Thursday at Barnett Park.' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'h2-cta',
            style: 'h2',
            children: [{ _type: 'span', _key: 'h2-cta-span', text: 'Come Join Us This Season' }],
            markDefs: [],
        },
        {
            _type: 'block',
            _key: 'cta-body',
            style: 'normal',
            children: [{ _type: 'span', _key: 'cta-body-span', text: 'Whether you\'re a seasoned rugby veteran or someone who has always been curious about the sport, the 2025 season is a perfect time to get involved. We practice every Thursday from 8–10pm at Barnett Park, 4801 W Colonial Dr, Orlando, FL 32808. No experience required — just show up, give it everything you\'ve got, and become part of Orlando\'s rugby community. The Claymores are more than a team. We\'re a club.' }],
            markDefs: [],
        },
    ],
}

async function main() {
    console.log('Creating blog post...')
    const result = await client.create(post)
    console.log('Created post:', result._id)
}

main().catch(console.error)
