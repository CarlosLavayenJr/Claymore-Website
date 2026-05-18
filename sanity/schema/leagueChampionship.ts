import { defineField, defineType } from 'sanity'

export const leagueChampionship = defineType({
    name: 'leagueChampionship',
    title: 'League Championship',
    type: 'document',
    description:
        'Site-wide canonical pointer to the active rugbyfl.com championship to scrape for the league standings table. There is only one of these documents — update the Championship ID at the start of each new season.',
    fields: [
        defineField({
            name: 'active',
            title: 'Active',
            type: 'boolean',
            description:
                'Off-season kill switch. When OFF the weekly cron does nothing — turn back ON at the start of the season.',
            initialValue: true,
        }),
        defineField({
            name: 'championshipId',
            title: 'Championship ID',
            type: 'string',
            description:
                'The Championship_ID query param from rugbyfl.com (e.g. "191" for Men D3 2025-2026). Update this once per season.',
            validation: (rule) => rule.required(),
            initialValue: '191',
        }),
        defineField({
            name: 'seasonLabel',
            title: 'Season Label',
            type: 'string',
            description: 'e.g. "2025-2026". Shown on the table and used as the key for /standings/[season] lookups.',
            validation: (rule) => rule.required(),
            initialValue: '2025-2026',
        }),
        defineField({
            name: 'divisionName',
            title: 'Division Name',
            type: 'string',
            description: 'e.g. "Men Division 3". Shown as the table heading.',
            initialValue: 'Men Division 3',
        }),
        defineField({
            name: 'lastScrapedAt',
            title: 'Last Scraped At',
            type: 'datetime',
            description: 'Auto-updated by the scraper — do not edit by hand.',
            readOnly: true,
        }),
        defineField({
            name: 'lastScrapeStatus',
            title: 'Last Scrape Status',
            type: 'string',
            description: 'Auto-updated by the scraper. "success" on a clean run, error message otherwise.',
            readOnly: true,
        }),
    ],
    preview: {
        select: {
            season: 'seasonLabel',
            division: 'divisionName',
            cid: 'championshipId',
            active: 'active',
        },
        prepare({ season, division, cid, active }) {
            return {
                title: `${division || 'League'} · ${season || ''}`.trim(),
                subtitle: `Championship_ID=${cid}${active ? '' : ' · INACTIVE'}`,
            }
        },
    },
})
