// Local SEO landing pages — one per nearby city in `areaServed` (lib/schema.ts).
// Each one targets long-tail "rugby in [city]" / "rugby club near [city]" queries.
// Add a new city here + it will appear in the sitemap automatically.

export interface City {
    slug: string
    name: string // "Kissimmee"
    fullName: string // "Kissimmee, FL"
    driveMinutes: number // approx drive to the Claymores' Orlando training ground
    direction: string // "south" / "north" / etc — for prose
    landmarks: string[] // local landmarks for natural copy
    intro: string // 1–2 sentence intro
}

export const CITIES: City[] = [
    // Original four
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
            'The Central Florida Claymores RFC are the rugby club for Winter Park. Orlando is an easy drive west from Winter Park, putting club rugby comfortably within reach.',
    },
    {
        slug: 'lake-mary',
        name: 'Lake Mary',
        fullName: 'Lake Mary, FL',
        driveMinutes: 35,
        direction: 'north',
        landmarks: ['Heathrow', 'Seminole County', 'I-4 corridor'],
        intro:
            'If you live in Lake Mary and want to play rugby in Central Florida, the Claymores are your club. Orlando is roughly 35 minutes south down I-4 — close enough for serious commitment to club rugby.',
    },
    {
        slug: 'clermont',
        name: 'Clermont',
        fullName: 'Clermont, FL',
        driveMinutes: 35,
        direction: 'west',
        landmarks: ['Lake Minneola', 'Citrus Tower', 'Lake County'],
        intro:
            'The Central Florida Claymores RFC welcome players from across Lake County, including Clermont. Orlando is a straight shot east on Highway 50 — putting club rugby easily within reach.',
    },

    // West Orange County (closest to the Orlando training ground)
    {
        slug: 'ocoee',
        name: 'Ocoee',
        fullName: 'Ocoee, FL',
        driveMinutes: 10,
        direction: 'east',
        landmarks: ['West Oaks Mall', 'Lake Olympia', 'West Orange County'],
        intro:
            "Ocoee is one of the closest cities to the Claymores. The Central Florida Claymores RFC are Orlando's USA Rugby D3 club — our training ground is roughly 10 minutes east on Colonial Drive.",
    },
    {
        slug: 'apopka',
        name: 'Apopka',
        fullName: 'Apopka, FL',
        driveMinutes: 15,
        direction: 'south',
        landmarks: ['Wekiwa Springs', 'Northwest Recreation Complex', 'Lake Apopka'],
        intro:
            "Apopka residents are some of the closest to the Claymores. The Central Florida Claymores RFC are Orlando's USA Rugby D3 club, just 15 minutes south down 441.",
    },
    {
        slug: 'winter-garden',
        name: 'Winter Garden',
        fullName: 'Winter Garden, FL',
        driveMinutes: 20,
        direction: 'east',
        landmarks: ['Plant Street', 'West Orange Trail', 'Garden Theatre'],
        intro:
            'The Central Florida Claymores RFC are the closest rugby club to Winter Garden. Orlando is a quick trip east on Colonial Drive — close enough for Winter Garden athletes to commit to club rugby.',
    },
    {
        slug: 'windermere',
        name: 'Windermere',
        fullName: 'Windermere, FL',
        driveMinutes: 20,
        direction: 'north',
        landmarks: ['Butler Chain of Lakes', 'Isleworth', 'West Orange'],
        intro:
            'Looking for rugby near Windermere? The Central Florida Claymores RFC are based in Orlando, roughly 20 minutes north of Windermere.',
    },

    // Seminole County (north corridor)
    {
        slug: 'maitland',
        name: 'Maitland',
        fullName: 'Maitland, FL',
        driveMinutes: 15,
        direction: 'south',
        landmarks: ['Lake Lily', 'Maitland Art Center', 'Orange County'],
        intro:
            'Maitland is a short drive from the Claymores. The Central Florida Claymores RFC are based in Orlando, about 15 minutes south of Maitland.',
    },
    {
        slug: 'altamonte-springs',
        name: 'Altamonte Springs',
        fullName: 'Altamonte Springs, FL',
        driveMinutes: 20,
        direction: 'south',
        landmarks: ['Cranes Roost Park', 'Altamonte Mall', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC are the rugby club for Altamonte Springs and the broader Seminole County area. Orlando is 20 minutes south — a short trip for Seminole County athletes.',
    },
    {
        slug: 'sanford',
        name: 'Sanford',
        fullName: 'Sanford, FL',
        driveMinutes: 30,
        direction: 'south',
        landmarks: ['Lake Monroe', 'Historic Downtown Sanford', 'Seminole County'],
        intro:
            'Sanford players join the Central Florida Claymores RFC for serious USA Rugby D3 competition. Orlando is 30 minutes south of Sanford — manageable for athletes committed to club rugby.',
    },

    // East Orlando / UCF corridor (recruiting hub)
    {
        slug: 'oviedo',
        name: 'Oviedo',
        fullName: 'Oviedo, FL',
        driveMinutes: 30,
        direction: 'west',
        landmarks: ['Oviedo on the Park', 'UCF area', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC welcome Oviedo and UCF-area players. Orlando is roughly 30 minutes west of Oviedo.',
    },
    {
        slug: 'east-orlando',
        name: 'East Orlando',
        fullName: 'East Orlando / UCF area, FL',
        driveMinutes: 25,
        direction: 'west',
        landmarks: ['University of Central Florida', 'Waterford Lakes', 'Avalon Park'],
        intro:
            "If you're in East Orlando or near UCF and looking to play club rugby, the Central Florida Claymores RFC are the senior USA Rugby D3 option in the area. Our Orlando training ground is roughly 25 minutes west of the UCF area.",
    },

    // South / Southwest Orlando
    {
        slug: 'dr-phillips',
        name: 'Dr. Phillips',
        fullName: 'Dr. Phillips, FL',
        driveMinutes: 20,
        direction: 'north',
        landmarks: ['Restaurant Row', 'Sand Lake Road', 'Southwest Orlando'],
        intro:
            "The Central Florida Claymores RFC are the rugby club for Dr. Phillips and the Restaurant Row corridor. Our Orlando training ground is about 20 minutes north of Dr. Phillips.",
    },
    {
        slug: 'lake-nona',
        name: 'Lake Nona',
        fullName: 'Lake Nona, FL',
        driveMinutes: 30,
        direction: 'northwest',
        landmarks: ['Medical City', 'Boxi Park', 'Southeast Orlando'],
        intro:
            "Lake Nona is one of Central Florida's fastest-growing communities — and the Central Florida Claymores RFC are the rugby club for the area. Our Orlando training ground is 30 minutes northwest of Lake Nona.",
    },
    {
        slug: 'st-cloud',
        name: 'St. Cloud',
        fullName: 'St. Cloud, FL',
        driveMinutes: 45,
        direction: 'north',
        landmarks: ['East Lake Tohopekaliga', 'Osceola County', 'Narcoossee'],
        intro:
            'St. Cloud players seeking serious club rugby join the Central Florida Claymores RFC. Orlando is 45 minutes north of St. Cloud.',
    },

    // East Orlando — additional coverage beyond the broader "East Orlando" page
    {
        slug: 'waterford-lakes',
        name: 'Waterford Lakes',
        fullName: 'Waterford Lakes, FL',
        driveMinutes: 20,
        direction: 'west',
        landmarks: ['Waterford Lakes Town Center', 'Alafaya Trail', 'East Orlando'],
        intro:
            'Looking for rugby near Waterford Lakes? The Central Florida Claymores RFC are the closest USA Rugby D3 club — our Orlando training ground is about 20 minutes west on the 408.',
    },
    {
        slug: 'avalon-park',
        name: 'Avalon Park',
        fullName: 'Avalon Park, FL',
        driveMinutes: 25,
        direction: 'west',
        landmarks: ['Avalon Park Town Center', 'East Orlando', 'Innovation Way'],
        intro:
            'Avalon Park residents who want to play club rugby join the Central Florida Claymores RFC. Orlando is roughly 25 minutes west of Avalon Park.',
    },
    {
        slug: 'bithlo',
        name: 'Bithlo',
        fullName: 'Bithlo, FL',
        driveMinutes: 30,
        direction: 'west',
        landmarks: ['East Orange County', 'Highway 50', 'Lake Pickett'],
        intro:
            "Bithlo and the far east side of Orange County are still close enough for the Claymores. The Central Florida Claymores RFC are based in Orlando, a straight shot west on Highway 50 from Bithlo.",
    },

    // Seminole County — east/central coverage
    {
        slug: 'casselberry',
        name: 'Casselberry',
        fullName: 'Casselberry, FL',
        driveMinutes: 20,
        direction: 'south',
        landmarks: ['Lake Concord', 'Seminole County', 'Highway 17-92'],
        intro:
            'Casselberry residents are some of the closest Seminole County players to the Claymores. The Central Florida Claymores RFC are based in Orlando — about 20 minutes south of Casselberry.',
    },
    {
        slug: 'winter-springs',
        name: 'Winter Springs',
        fullName: 'Winter Springs, FL',
        driveMinutes: 25,
        direction: 'south',
        landmarks: ['Tuscawilla', 'Central Winds Park', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC are the rugby club for Winter Springs and the broader east Seminole area. Orlando is 25 minutes south of Winter Springs.',
    },
    {
        slug: 'longwood',
        name: 'Longwood',
        fullName: 'Longwood, FL',
        driveMinutes: 25,
        direction: 'south',
        landmarks: ['Reiter Park', 'Seminole County', 'Big Tree Park'],
        intro:
            'Longwood players join the Central Florida Claymores RFC for serious USA Rugby D3 competition. Orlando is about 25 minutes south of Longwood.',
    },

    // West Orange + Lake County — additional coverage
    {
        slug: 'horizon-west',
        name: 'Horizon West',
        fullName: 'Horizon West, FL',
        driveMinutes: 25,
        direction: 'north',
        landmarks: ['Hamlin', 'Lakeside Village', 'West Orange County'],
        intro:
            "Horizon West is one of Central Florida's fastest-growing master-planned communities — and the Central Florida Claymores RFC are the closest senior club for residents. Orlando is 25 minutes north — easily reachable for Horizon West athletes.",
    },
    {
        slug: 'minneola',
        name: 'Minneola',
        fullName: 'Minneola, FL',
        driveMinutes: 35,
        direction: 'east',
        landmarks: ['Lake Minneola', 'Lake County', 'Highway 27'],
        intro:
            'Minneola sits right at the doorstep of Clermont and the broader Lake County rugby community. The Central Florida Claymores RFC are based in Orlando, about 35 minutes east of Minneola.',
    },
]

export function getCity(slug: string): City | undefined {
    return CITIES.find((c) => c.slug === slug)
}
