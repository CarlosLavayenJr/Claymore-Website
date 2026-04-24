// Local SEO landing pages — one per nearby city in `areaServed` (lib/schema.ts).
// Each one targets long-tail "rugby in [city]" / "rugby club near [city]" queries.
// Add a new city here + it will appear in the sitemap automatically.

export interface City {
    slug: string
    name: string // "Kissimmee"
    fullName: string // "Kissimmee, FL"
    driveMinutes: number // approx drive to Barnett Park, Orlando
    direction: string // "south" / "north" / etc — for prose
    landmarks: string[] // local landmarks for natural copy
    intro: string // 1–2 sentence intro
}

export const CITIES: City[] = [
    {
        slug: 'kissimmee',
        name: 'Kissimmee',
        fullName: 'Kissimmee, FL',
        driveMinutes: 30,
        direction: 'south',
        landmarks: ['Lake Tohopekaliga', 'Old Town', 'Osceola County'],
        intro:
            'Looking for a rugby club near Kissimmee? The Central Florida Claymores RFC are the closest USA Rugby D3 option, just a short drive north into Orlando.',
    },
    {
        slug: 'winter-park',
        name: 'Winter Park',
        fullName: 'Winter Park, FL',
        driveMinutes: 20,
        direction: 'east',
        landmarks: ['Park Avenue', 'Rollins College', 'Orange County'],
        intro:
            'The Central Florida Claymores RFC are the rugby club for Winter Park. Practice is at Barnett Park in Orlando, an easy drive west from Winter Park.',
    },
    {
        slug: 'lake-mary',
        name: 'Lake Mary',
        fullName: 'Lake Mary, FL',
        driveMinutes: 35,
        direction: 'north',
        landmarks: ['Heathrow', 'Seminole County', 'I-4 corridor'],
        intro:
            'If you live in Lake Mary and want to play rugby in Central Florida, the Claymores are your club. Practice in Orlando is roughly 35 minutes south down I-4.',
    },
    {
        slug: 'clermont',
        name: 'Clermont',
        fullName: 'Clermont, FL',
        driveMinutes: 35,
        direction: 'west',
        landmarks: ['Lake Minneola', 'Citrus Tower', 'Lake County'],
        intro:
            'The Central Florida Claymores RFC welcome players from across Lake County, including Clermont. Practice is at Barnett Park in Orlando — a straight shot east on Highway 50.',
    },
]

export function getCity(slug: string): City | undefined {
    return CITIES.find((c) => c.slug === slug)
}
