import type { SanityPractice } from '@/sanity/lib/queries'
import { slugify } from '@/lib/seo'

export const festivalsQuery = `*[_type in ["festival", "event"] && active == true] | order(startDate asc) {
    ...,
    "eventType": _type,
    "iconUrl": icon.asset->url,
    "iconAlt": icon.alt
}`

export function festivalSlug(event: Pick<SanityPractice, 'startDate' | 'title'>) {
    return `${event.startDate}-${slugify(event.title)}`
}
