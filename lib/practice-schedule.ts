import { cache } from 'react'
import { client } from '@/sanity/lib/client'
import {
    practiceScheduleQuery,
    type SanityPracticeSchedule,
} from '@/sanity/lib/queries'

export interface PracticeSchedule {
    seasonLabel: string
    weekday: string
    time: string
    venueName: string
    venueAddress: string
    venueStreet: string
    venueCity: string
    venueRegion: string
    venuePostalCode: string
    mapEmbedUrl: string
    seasonalNote: string
}

// Fallback used when the singleton doc hasn't been created yet (fresh deploys)
// or fields are missing. Matches the historical hardcoded copy so the site
// never breaks or shows blanks.
const DEFAULT: PracticeSchedule = {
    seasonLabel: 'Regular Season',
    weekday: 'Thursday',
    time: '8–10pm',
    venueName: 'Barnett Park',
    venueAddress: '4801 W Colonial Dr, Orlando, FL 32808',
    venueStreet: '4801 W Colonial Dr',
    venueCity: 'Orlando',
    venueRegion: 'FL',
    venuePostalCode: '32808',
    mapEmbedUrl:
        'https://maps.google.com/maps?q=Barnett+Park,+4801+W+Colonial+Dr,+Orlando,+FL+32808&output=embed',
    seasonalNote: 'Schedule changes seasonally — check the fixtures calendar for the latest.',
}

function merge(doc: SanityPracticeSchedule | null | undefined): PracticeSchedule {
    if (!doc) return DEFAULT
    return {
        seasonLabel: doc.seasonLabel || DEFAULT.seasonLabel,
        weekday: doc.weekday || DEFAULT.weekday,
        time: doc.time || DEFAULT.time,
        venueName: doc.venueName || DEFAULT.venueName,
        venueAddress: doc.venueAddress || DEFAULT.venueAddress,
        venueStreet: doc.venueStreet || DEFAULT.venueStreet,
        venueCity: doc.venueCity || DEFAULT.venueCity,
        venueRegion: doc.venueRegion || DEFAULT.venueRegion,
        venuePostalCode: doc.venuePostalCode || DEFAULT.venuePostalCode,
        mapEmbedUrl: doc.mapEmbedUrl || DEFAULT.mapEmbedUrl,
        seasonalNote: doc.seasonalNote || DEFAULT.seasonalNote,
    }
}

// Memoized within a single request — multiple components calling this
// during one render share a single Sanity fetch.
export const getPracticeSchedule = cache(async (): Promise<PracticeSchedule> => {
    try {
        const doc = await client.fetch<SanityPracticeSchedule | null>(practiceScheduleQuery)
        return merge(doc)
    } catch {
        return DEFAULT
    }
})

// Short formatted strings useful in compact contexts.
export function formatScheduleShort(s: PracticeSchedule): string {
    return `${s.weekday}s at ${s.venueName}`
}

export function formatScheduleDayTime(s: PracticeSchedule): string {
    return `${s.weekday}s ${s.time}`
}

export function formatScheduleFull(s: PracticeSchedule): string {
    return `${s.weekday}s ${s.time} at ${s.venueName}, ${s.venueAddress}`
}
