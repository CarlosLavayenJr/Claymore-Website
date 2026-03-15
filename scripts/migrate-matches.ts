import { createClient } from '@sanity/client'

const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN!,
    useCdn: false,
})

type MatchStatus = 'played' | 'upcoming' | 'cancelled' | 'forfeit_us' | 'forfeit_them'

interface RawMatch {
    date: string
    homeTeam: string
    homeScore: number
    awayTeam: string
    awayScore: number
    season: number
    note?: string
    forfeitBy?: string
    cancelled?: boolean
    upcoming?: boolean
}

function getStatus(m: RawMatch): MatchStatus {
    if (m.cancelled) return 'cancelled'
    if (m.upcoming) return 'upcoming'
    if (m.forfeitBy) {
        const isClaymores = m.forfeitBy.includes('Claymores') || m.forfeitBy.includes('IR/Claymores')
        return isClaymores ? 'forfeit_us' : 'forfeit_them'
    }
    return 'played'
}

function toIsoDate(d: string): string {
    const [month, day, year] = d.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

const matches: RawMatch[] = [
    { date: "9/28/2024", homeTeam: "UM", homeScore: 12, awayTeam: "Claymores", awayScore: 25, season: 2024 },
    { date: "10/26/2024", homeTeam: "Jacksonville D3", homeScore: 38, awayTeam: "Claymores", awayScore: 31, season: 2024 },
    { date: "11/16/2024", homeTeam: "Claymores", homeScore: 48, awayTeam: "Orlando Otters", awayScore: 0, season: 2024 },
    { date: "12/7/2024", homeTeam: "UCF", homeScore: 49, awayTeam: "Claymores", awayScore: 17, season: 2024 },
    { date: "1/25/2025", homeTeam: "Claymores", homeScore: 20, awayTeam: "Lakeland", awayScore: 0, note: "Forfeit by Lakeland", forfeitBy: "Lakeland", season: 2025 },
    { date: "2/1/2025", homeTeam: "Brevard", homeScore: 0, awayTeam: "Claymores", awayScore: 0, upcoming: true, season: 2025 },
    { date: "2/8/2025", homeTeam: "Claymores", homeScore: 0, awayTeam: "Sarasota", awayScore: 0, upcoming: true, season: 2025 },
    { date: "2/22/2025", homeTeam: "Claymores", homeScore: 0, awayTeam: "Brevard", awayScore: 0, upcoming: true, season: 2025 },
    { date: "3/1/2025", homeTeam: "Sarasota", homeScore: 0, awayTeam: "Claymores", awayScore: 0, upcoming: true, season: 2025 },
    { date: "3/15/2025", homeTeam: "Lakeland", homeScore: 0, awayTeam: "Claymores", awayScore: 0, upcoming: true, season: 2025 },
    { date: "3/22/2025", homeTeam: "Orlando (D3)", homeScore: 0, awayTeam: "Claymores", awayScore: 0, upcoming: true, season: 2025 },
    { date: "1/20/2024", homeTeam: "Pelicans D3", homeScore: 17, awayTeam: "Claymores", awayScore: 17, season: 2024 },
    { date: "1/27/2024", homeTeam: "Claymores", homeScore: 3, awayTeam: "Sarasota", awayScore: 50, season: 2024 },
    { date: "2/24/2024", homeTeam: "Brevard", homeScore: 20, awayTeam: "Claymores", awayScore: 0, note: "Forfeit by Claymores. Game played Brevard 55-5", forfeitBy: "Claymores", season: 2024 },
    { date: "3/2/2024", homeTeam: "Claymores", homeScore: 20, awayTeam: "Treasure Coast", awayScore: 0, note: "Forfeit by Treasure Coast", forfeitBy: "Treasure Coast", season: 2024 },
    { date: "4/6/2024", homeTeam: "Claymores", homeScore: 19, awayTeam: "Lakeland", awayScore: 49, note: "Moved from 2/17/2024 - Weather", season: 2024 },
    { date: "1/14/2023", homeTeam: "Orlando D4", homeScore: 28, awayTeam: "Claymores", awayScore: 30, season: 2023 },
    { date: "1/28/2023", homeTeam: "Lakeland", homeScore: 36, awayTeam: "Claymores", awayScore: 17, season: 2023 },
    { date: "2/4/2023", homeTeam: "Claymores", homeScore: 50, awayTeam: "Treasure Coast", awayScore: 5, season: 2023 },
    { date: "2/18/2023", homeTeam: "Claymores", homeScore: 15, awayTeam: "Tallahassee", awayScore: 14, season: 2023 },
    { date: "3/4/2023", homeTeam: "Treasure Coast", homeScore: 0, awayTeam: "Claymores", awayScore: 20, note: "Forfeit by Treasure Coast Armada", forfeitBy: "Treasure Coast", season: 2023 },
    { date: "3/18/2023", homeTeam: "Claymores", homeScore: 26, awayTeam: "Lakeland", awayScore: 17, season: 2023 },
    { date: "4/1/2023", homeTeam: "Okapi", homeScore: 26, awayTeam: "Claymores", awayScore: 27, note: "Semi-Final #1", season: 2023 },
    { date: "4/15/2023", homeTeam: "Gainesville", homeScore: 45, awayTeam: "Claymores", awayScore: 17, note: "Men's D4 Clubs Final - Field 12", season: 2023 },
    { date: "10/15/2022", homeTeam: "UCF", homeScore: 19, awayTeam: "Claymores", awayScore: 22, season: 2022 },
    { date: "10/29/2022", homeTeam: "Eckerd", homeScore: 0, awayTeam: "Claymores", awayScore: 0, note: "CANCELLED", cancelled: true, season: 2022 },
    { date: "11/5/2022", homeTeam: "Orlando Otters", homeScore: 0, awayTeam: "Claymores", awayScore: 95, season: 2022 },
    { date: "12/3/2022", homeTeam: "Jacksonville", homeScore: 26, awayTeam: "Claymores", awayScore: 12, season: 2022 },
    { date: "2/12/2022", homeTeam: "IR/Claymores", homeScore: 20, awayTeam: "Lakeland", awayScore: 0, forfeitBy: "Lakeland", note: "Forfeit by Lakeland", season: 2022 },
    { date: "1/22/2022", homeTeam: "Lakeland", homeScore: 36, awayTeam: "IR/Claymores", awayScore: 0, season: 2022 },
    { date: "2/5/2022", homeTeam: "IR/Claymores", homeScore: 12, awayTeam: "Orlando (D4)", awayScore: 7, season: 2022 },
    { date: "2/19/2022", homeTeam: "Ft. Lauderdale", homeScore: 20, awayTeam: "IR/Claymores", awayScore: 39, season: 2022 },
    { date: "3/5/2022", homeTeam: "Daytona", homeScore: 52, awayTeam: "IR/Claymores", awayScore: 9, season: 2022 },
    { date: "3/19/2022", homeTeam: "IR/Claymores", homeScore: 8, awayTeam: "Daytona", awayScore: 31, season: 2022 },
    { date: "1/30/2021", homeTeam: "IR/Claymores", homeScore: 5, awayTeam: "Lakeland (D4)", awayScore: 26, season: 2021 },
    { date: "2/6/2021", homeTeam: "Orlando (D4)", homeScore: 45, awayTeam: "IR/Claymores", awayScore: 21, season: 2021 },
    { date: "2/13/2021", homeTeam: "Daytona (D4)", homeScore: 20, awayTeam: "IR/Claymores", awayScore: 0, forfeitBy: "IR/Claymores", note: "Forfeit by IR/Claymores", season: 2021 },
    { date: "2/27/2021", homeTeam: "IR/Claymores", homeScore: 0, awayTeam: "Daytona (D4)", awayScore: 31, season: 2021 },
    { date: "3/6/2021", homeTeam: "IR/Claymores", homeScore: 20, awayTeam: "Orlando (D4)", awayScore: 0, forfeitBy: "Orlando (D4)", note: "Forfeit by Orlando", season: 2021 },
    { date: "3/20/2021", homeTeam: "Lakeland (D4)", homeScore: 50, awayTeam: "IR/Claymores", awayScore: 24, season: 2021 },
    { date: "4/10/2021", homeTeam: "Tallahassee (D4)", homeScore: 53, awayTeam: "IR/Claymores", awayScore: 0, note: "Men's D4 Quarter-Final", season: 2021 },
]

async function run() {
    console.log(`Migrating ${matches.length} matches to Sanity...`)
    for (const m of matches) {
        const doc = {
            _type: 'match',
            date: toIsoDate(m.date),
            season: m.season,
            homeTeam: m.homeTeam,
            homeScore: m.homeScore,
            awayTeam: m.awayTeam,
            awayScore: m.awayScore,
            status: getStatus(m),
            ...(m.note ? { note: m.note } : {}),
        }
        await client.create(doc)
        console.log(`  ✓ ${m.date} — ${m.homeTeam} vs ${m.awayTeam}`)
    }
    console.log('Done.')
}

run().catch(console.error)
