import type { SanityPractice } from '@/sanity/lib/queries'
import { isClubEvent, slugify } from '@/lib/seo'

export const festivalsQuery = `*[_type in ["festival", "event"] && active == true] | order(startDate asc) {
    ...,
    "eventType": _type,
    "iconUrl": icon.asset->url,
    "iconAlt": icon.alt
}`

export function festivalSlug(event: Pick<SanityPractice, 'startDate' | 'title'>) {
    return `${event.startDate}-${slugify(event.title)}`
}

/**
 * Public schedule lists show a festival's own card (venue, sides, social), so
 * a club-event match doc on the same day — there only so members can answer
 * "can you play?" — would list the same day twice. Drop those match docs.
 */
export function withoutFestivalDuplicates<M extends { date: string; homeTeam: string; awayTeam: string }>(
    matches: M[],
    events: Pick<SanityPractice, 'eventType' | 'startDate' | 'active'>[],
): M[] {
    const festivalDays = new Set(events.filter(e => e.eventType === 'festival' && e.active).map(e => e.startDate))
    return matches.filter(m => !(isClubEvent(m) && festivalDays.has(m.date.slice(0, 10))))
}
