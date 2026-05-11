import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import { getPracticeSchedule } from '@/lib/practice-schedule'

export const alt = 'Central Florida Claymores RFC — Orlando Rugby'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
    const schedule = await getPracticeSchedule()
    return brandedImageResponse({
        eyebrow: 'Central Florida Claymores RFC',
        title: "Orlando's Rugby Club",
        subtitle: 'USA Rugby D3 · Florida Rugby Union · Established 2018',
        footerRight: `Practice every ${schedule.weekday}`,
    })
}
