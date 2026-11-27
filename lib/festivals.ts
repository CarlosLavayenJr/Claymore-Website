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
/**
 * The festival a club-event match doc stands in for: an active festival on the
 * same day. The match doc stays (members' availability answers hang off it);
 * only its public page and sitemap entry defer to the festival's.
 */
export function festivalForClubEvent<E extends Pick<SanityPractice, 'eventType' | 'startDate' | 'active'>>(
    match: { date: string; homeTeam: string; awayTeam: string },
    events: E[],
): E | undefined {
    if (!isClubEvent(match)) return undefined
    const day = match.date.slice(0, 10)
    return events.find(e => e.eventType === 'festival' && e.active && e.startDate === day)
}

export function withoutFestivalDuplicates<M extends { date: string; homeTeam: string; awayTeam: string }>(
    matches: M[],
    events: Pick<SanityPractice, 'eventType' | 'startDate' | 'active'>[],
): M[] {
    return matches.filter(m => !festivalForClubEvent(m, events))
}
