// Local SEO landing pages — one per nearby city in `areaServed` (lib/schema.ts).
// Each one targets long-tail "rugby in [city]" / "rugby club near [city]" queries.
// Add a new city here + it will appear in the sitemap automatically.
//
// Location, position and drive data were measured, not estimated (Oct 2026):
// coordinates from OpenStreetMap Nominatim, driving distance/time/roads from OSRM
// routing to Barnett Park (28.5626, -81.4422). Drive times are without traffic.

export type CompassPoint = 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest'

export interface City {
    slug: string
    name: string // "Kissimmee"
    fullName: string // "Kissimmee, FL"
    county: string
    lat: number
    lon: number
    position: CompassPoint // where the city sits relative to practice (Kissimmee is south)
    driveMiles: number
    driveMinutes: number // without traffic
    routes: string[] // main roads on the drive to practice, longest first
    landmarks: string[] // local landmarks for natural copy
    intro: string // 1–2 sentence intro
}

export const CITIES: City[] = [
    // Original four
    {
        slug: 'kissimmee',
        name: 'Kissimmee',
        fullName: 'Kissimmee, FL',
        county: 'Osceola County',
        lat: 28.2919,
        lon: -81.4076,
        position: 'south',
        driveMiles: 24.5,
        driveMinutes: 40,
        routes: ['Florida\'s Turnpike', 'CR 423', 'I-4'],
        landmarks: ['Lake Tohopekaliga', 'Old Town', 'Osceola County'],
        intro:
            'Looking for rugby near Kissimmee? The Central Florida Claymores RFC are Orlando\'s USA Rugby D3 club, and we welcome Osceola County players of every experience level.',
    },
    {
        slug: 'winter-park',
        name: 'Winter Park',
        fullName: 'Winter Park, FL',
        county: 'Orange County',
        lat: 28.5978,
        lon: -81.351,
        position: 'northeast',
        driveMiles: 9.5,
        driveMinutes: 24,
        routes: ['US 17', 'Orange Avenue', 'I-4'],
        landmarks: ['Park Avenue', 'Rollins College', 'Orange County'],
        intro:
            'From Park Avenue to Rollins College, Winter Park athletes looking for club rugby can find it with the Central Florida Claymores RFC in Orlando.',
    },
    {
        slug: 'lake-mary',
        name: 'Lake Mary',
        fullName: 'Lake Mary, FL',
        county: 'Seminole County',
        lat: 28.7563,
        lon: -81.3221,
        position: 'northeast',
        driveMiles: 21.0,
        driveMinutes: 38,
        routes: ['I-4', 'SR 423', 'West Lake Mary Boulevard'],
        landmarks: ['Heathrow', 'Seminole County', 'I-4 corridor'],
        intro:
            'If you live in Lake Mary or Heathrow and want to play rugby in Central Florida, the Central Florida Claymores RFC are an I-4 drive away in Orlando.',
    },
    {
        slug: 'clermont',
        name: 'Clermont',
        fullName: 'Clermont, FL',
        county: 'Lake County',
        lat: 28.5552,
        lon: -81.7669,
        position: 'west',
        driveMiles: 22.1,
        driveMinutes: 36,
        routes: ['SR 50', 'Florida\'s Turnpike', 'SR 408 (toll)'],
        landmarks: ['Lake Minneola', 'Citrus Tower', 'Lake County'],
        intro:
            'The Central Florida Claymores RFC welcome players from across Lake County, including Clermont. Practice is in Orlando, straight down Highway 50.',
    },
    // West Orange County (closest to the Orlando training ground)
    {
        slug: 'ocoee',
        name: 'Ocoee',
        fullName: 'Ocoee, FL',
        county: 'Orange County',
        lat: 28.5694,
        lon: -81.5442,
        position: 'west',
        driveMiles: 8.8,
        driveMinutes: 19,
        routes: ['SR 408 (toll)', 'SR 50', 'Bluford Avenue'],
        landmarks: ['West Oaks Mall', 'Lake Olympia', 'West Orange County'],
        intro:
            'Ocoee is one of the nearest cities to the Claymores\' training ground. The Central Florida Claymores RFC are Orlando\'s USA Rugby D3 club and practice at Barnett Park off Colonial Drive.',
    },
    {
        slug: 'apopka',
        name: 'Apopka',
        fullName: 'Apopka, FL',
        county: 'Orange County',
        lat: 28.6733,
        lon: -81.5116,
        position: 'northwest',
        driveMiles: 11.2,
        driveMinutes: 26,
        routes: ['US 441', 'Pine Hills Road', 'Overland Road'],
        landmarks: ['Wekiwa Springs', 'Northwest Recreation Complex', 'Lake Apopka'],
        intro:
            'Apopka athletes have a straightforward trip to rugby: the Central Florida Claymores RFC practice at Barnett Park in Pine Hills, down US 441 from Apopka.',
    },
    {
        slug: 'winter-garden',
        name: 'Winter Garden',
        fullName: 'Winter Garden, FL',
        county: 'Orange County',
        lat: 28.5657,
        lon: -81.5857,
        position: 'west',
        driveMiles: 11.5,
        driveMinutes: 23,
        routes: ['SR 50', 'SR 408 (toll)'],
        landmarks: ['Plant Street', 'West Orange Trail', 'Garden Theatre'],
        intro:
            'Winter Garden athletes can play club rugby with the Central Florida Claymores RFC. Practice is in Orlando, a trip east along Colonial Drive or the 408.',
    },
    {
        slug: 'windermere',
        name: 'Windermere',
        fullName: 'Windermere, FL',
        county: 'Orange County',
        lat: 28.4945,
        lon: -81.5346,
        position: 'southwest',
        driveMiles: 10.8,
        driveMinutes: 24,
        routes: ['Apopka Vineland Road', 'SR 408 (toll)', '6th Avenue'],
        landmarks: ['Butler Chain of Lakes', 'Isleworth', 'West Orange'],
        intro:
            'Looking for rugby near Windermere? The Central Florida Claymores RFC are Orlando\'s USA Rugby D3 club, training at Barnett Park in west Orlando.',
    },
    // Seminole County (north corridor)
    {
        slug: 'maitland',
        name: 'Maitland',
        fullName: 'Maitland, FL',
        county: 'Orange County',
        lat: 28.6275,
        lon: -81.3656,
        position: 'northeast',
        driveMiles: 10.3,
        driveMinutes: 25,
        routes: ['SR 423', 'SR 416', 'US 17'],
        landmarks: ['Lake Lily', 'Maitland Art Center', 'Orange County'],
        intro:
            'Maitland players can join the Central Florida Claymores RFC, Orlando\'s USA Rugby D3 club. No experience is needed to start.',
    },
    {
        slug: 'altamonte-springs',
        name: 'Altamonte Springs',
        fullName: 'Altamonte Springs, FL',
        county: 'Seminole County',
        lat: 28.6619,
        lon: -81.3886,
        position: 'northeast',
        driveMiles: 11.3,
        driveMinutes: 25,
        routes: ['SR 423', 'I-4', 'SR 416'],
        landmarks: ['Cranes Roost Park', 'Altamonte Mall', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC welcome rugby players from Altamonte Springs and the broader Seminole County area.',
    },
    {
        slug: 'sanford',
        name: 'Sanford',
        fullName: 'Sanford, FL',
        county: 'Seminole County',
        lat: 28.8117,
        lon: -81.268,
        position: 'northeast',
        driveMiles: 27.1,
        driveMinutes: 47,
        routes: ['I-4', 'West 1st Street', 'SR 423'],
        landmarks: ['Lake Monroe', 'Historic Downtown Sanford', 'Seminole County'],
        intro:
            'Sanford players join the Central Florida Claymores RFC for USA Rugby D3 competition in the Florida Rugby Union, with practice down I-4 in Orlando.',
    },
    // East Orlando / UCF corridor (recruiting hub)
    {
        slug: 'oviedo',
        name: 'Oviedo',
        fullName: 'Oviedo, FL',
        county: 'Seminole County',
        lat: 28.6703,
        lon: -81.2085,
        position: 'northeast',
        driveMiles: 24.7,
        driveMinutes: 38,
        routes: ['SR 408 (toll)', 'SR 417 (toll)', 'SR 426'],
        landmarks: ['Oviedo on the Park', 'UCF area', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC welcome Oviedo and UCF-area players looking for senior club rugby in Central Florida.',
    },
    {
        slug: 'east-orlando',
        name: 'East Orlando',
        fullName: 'East Orlando / UCF area, FL',
        county: 'Orange County',
        lat: 28.5996,
        lon: -81.1971,
        position: 'east',
        driveMiles: 21.0,
        driveMinutes: 35,
        routes: ['SR 408 (toll)', 'SR 434'],
        landmarks: ['University of Central Florida', 'Waterford Lakes', 'Avalon Park'],
        intro:
            'If you\'re in East Orlando or near UCF and want to keep playing rugby after college, or start for the first time, the Central Florida Claymores RFC are Orlando\'s senior USA Rugby D3 club.',
    },
    // South / Southwest Orlando
    {
        slug: 'dr-phillips',
        name: 'Dr. Phillips',
        fullName: 'Dr. Phillips, FL',
        county: 'Orange County',
        lat: 28.4609,
        lon: -81.4915,
        position: 'southwest',
        driveMiles: 9.9,
        driveMinutes: 23,
        routes: ['SR 435', 'Turkey Lake Road', 'Vineland Road'],
        landmarks: ['Restaurant Row', 'Sand Lake Road', 'Southwest Orlando'],
        intro:
            'The Central Florida Claymores RFC welcome players from Dr. Phillips and the Restaurant Row corridor of southwest Orlando.',
    },
    {
        slug: 'lake-nona',
        name: 'Lake Nona',
        fullName: 'Lake Nona, FL',
        county: 'Orange County',
        lat: 28.3976,
        lon: -81.2639,
        position: 'southeast',
        driveMiles: 26.7,
        driveMinutes: 41,
        routes: ['SR 408 (toll)', 'SR 417 (toll)', 'Lake Nona Boulevard'],
        landmarks: ['Medical City', 'Boxi Park', 'Southeast Orlando'],
        intro:
            'Lake Nona is one of Central Florida\'s fastest-growing communities, and its athletes can play club rugby with the Central Florida Claymores RFC in Orlando.',
    },
    {
        slug: 'st-cloud',
        name: 'St. Cloud',
        fullName: 'St. Cloud, FL',
        county: 'Osceola County',
        lat: 28.2499,
        lon: -81.2839,
        position: 'southeast',
        driveMiles: 30.1,
        driveMinutes: 47,
        routes: ['Florida\'s Turnpike', 'US 192', 'CR 423'],
        landmarks: ['East Lake Tohopekaliga', 'Osceola County', 'Narcoossee'],
        intro:
            'St. Cloud players looking for competitive club rugby can join the Central Florida Claymores RFC, Orlando\'s USA Rugby D3 club.',
    },
    // East Orlando — additional coverage beyond the broader "East Orlando" page
    {
        slug: 'waterford-lakes',
        name: 'Waterford Lakes',
        fullName: 'Waterford Lakes, FL',
        county: 'Orange County',
        lat: 28.5441,
        lon: -81.1926,
        position: 'east',
        driveMiles: 18.0,
        driveMinutes: 29,
        routes: ['SR 408 (toll)'],
        landmarks: ['Waterford Lakes Town Center', 'Alafaya Trail', 'East Orlando'],
        intro:
            'Looking for rugby near Waterford Lakes? The Central Florida Claymores RFC practice in west Orlando, a straight run across town on the 408.',
    },
    {
        slug: 'avalon-park',
        name: 'Avalon Park',
        fullName: 'Avalon Park, FL',
        county: 'Orange County',
        lat: 28.5116,
        lon: -81.1498,
        position: 'east',
        driveMiles: 23.4,
        driveMinutes: 40,
        routes: ['SR 408 (toll)', 'Alafaya Trail'],
        landmarks: ['Avalon Park Town Center', 'East Orlando', 'Innovation Way'],
        intro:
            'Avalon Park residents who want to play club rugby can join the Central Florida Claymores RFC, Orlando\'s USA Rugby D3 club.',
    },
    {
        slug: 'bithlo',
        name: 'Bithlo',
        fullName: 'Bithlo, FL',
        county: 'Orange County',
        lat: 28.5632,
        lon: -81.1102,
        position: 'east',
        driveMiles: 24.4,
        driveMinutes: 39,
        routes: ['SR 408 (toll)', 'SR 50'],
        landmarks: ['East Orange County', 'Highway 50', 'Lake Pickett'],
        intro:
            'Bithlo and the far east side of Orange County are within reach of the Claymores. The Central Florida Claymores RFC practice in Orlando, west along Highway 50 and the 408.',
    },
    // Seminole County — east/central coverage
    {
        slug: 'casselberry',
        name: 'Casselberry',
        fullName: 'Casselberry, FL',
        county: 'Seminole County',
        lat: 28.6715,
        lon: -81.3382,
        position: 'northeast',
        driveMiles: 13.9,
        driveMinutes: 31,
        routes: ['SR 423', 'US 17 Truck', 'US 17'],
        landmarks: ['Lake Concord', 'Seminole County', 'Highway 17-92'],
        intro:
            'Casselberry players can join the Central Florida Claymores RFC, Orlando\'s USA Rugby D3 club, for competitive rugby in the Florida Rugby Union.',
    },
    {
        slug: 'winter-springs',
        name: 'Winter Springs',
        fullName: 'Winter Springs, FL',
        county: 'Seminole County',
        lat: 28.6987,
        lon: -81.3055,
        position: 'northeast',
        driveMiles: 17.2,
        driveMinutes: 37,
        routes: ['US 17', 'SR 423', 'US 17 Truck'],
        landmarks: ['Tuscawilla', 'Central Winds Park', 'Seminole County'],
        intro:
            'The Central Florida Claymores RFC welcome rugby players from Winter Springs and the broader east Seminole area.',
    },
    {
        slug: 'longwood',
        name: 'Longwood',
        fullName: 'Longwood, FL',
        county: 'Seminole County',
        lat: 28.7012,
        lon: -81.3462,
        position: 'northeast',
        driveMiles: 16.7,
        driveMinutes: 33,
        routes: ['I-4', 'SR 423', 'SR 434'],
        landmarks: ['Reiter Park', 'Seminole County', 'Big Tree Park'],
        intro:
            'Longwood players join the Central Florida Claymores RFC for USA Rugby D3 competition, with practice in Orlando.',
    },
    // West Orange + Lake County — additional coverage
    {
        slug: 'horizon-west',
        name: 'Horizon West',
        fullName: 'Horizon West, FL',
        county: 'Orange County',
        lat: 28.4744,
        lon: -81.6265,
        position: 'southwest',
        driveMiles: 16.3,
        driveMinutes: 27,
        routes: ['SR 429 (toll)', 'SR 408 (toll)', 'Florida\'s Turnpike'],
        landmarks: ['Hamlin', 'Lakeside Village', 'West Orange County'],
        intro:
            'Horizon West is one of Central Florida\'s fastest-growing master-planned communities, and its athletes can play senior club rugby with the Central Florida Claymores RFC.',
    },
    {
        slug: 'minneola',
        name: 'Minneola',
        fullName: 'Minneola, FL',
        county: 'Lake County',
        lat: 28.5757,
        lon: -81.7483,
        position: 'west',
        driveMiles: 23.7,
        driveMinutes: 36,
        routes: ['Florida\'s Turnpike', 'SR 408 (toll)', 'CR Old 50'],
        landmarks: ['Lake Minneola', 'Lake County', 'Highway 27'],
        intro:
            'Minneola sits next to Clermont in Lake County. Players from the area can join the Central Florida Claymores RFC, Orlando\'s USA Rugby D3 club.',
    },
]

const OPPOSITE: Record<CompassPoint, CompassPoint> = {
    north: 'south',
    northeast: 'southwest',
    east: 'west',
    southeast: 'northwest',
    south: 'north',
    southwest: 'northeast',
    west: 'east',
    northwest: 'southeast',
}

// Direction you travel from the city to reach practice.
export function travelDirection(c: City): CompassPoint {
    return OPPOSITE[c.position]
}

export function getCity(slug: string): City | undefined {
    return CITIES.find((c) => c.slug === slug)
}

// Straight-line miles between two cities (haversine).
function milesBetween(a: City, b: City): number {
    const rad = (d: number) => (d * Math.PI) / 180
    const dLat = rad(b.lat - a.lat)
    const dLon = rad(b.lon - a.lon)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
    return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

export function nearbyCities(c: City, count = 5): City[] {
    return CITIES.filter((other) => other.slug !== c.slug)
        .sort((a, b) => milesBetween(c, a) - milesBetween(c, b))
        .slice(0, count)
}

export function directionsUrl(c: City, destination: string): string {
    const params = new URLSearchParams({ api: '1', origin: c.fullName, destination, travelmode: 'driving' })
    return `https://www.google.com/maps/dir/?${params}`
}
