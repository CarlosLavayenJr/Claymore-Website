import { defineField, defineType } from 'sanity'

export const leagueStandings = defineType({
    name: 'leagueStandings',
    title: 'League Standings',
    type: 'document',
    description:
        'A scraped snapshot of a rugbyfl.com championship standings table. One document per Championship_ID — persists forever so /standings/[season] can render historical standings. Created and updated by the weekly scraper; do not edit by hand.',
    fields: [
        defineField({
            name: 'championshipId',
            title: 'Championship ID',
            type: 'string',
            description: 'The Championship_ID from rugbyfl.com. Acts as the unique key for this snapshot.',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'seasonLabel',
            title: 'Season Label',
            type: 'string',
            description: 'e.g. "2025-2026". Used as the lookup key for /standings/[season].',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'divisionName',
            title: 'Division Name',
            type: 'string',
            description: 'e.g. "Men Division 3".',
        }),
        defineField({
            name: 'lastUpdated',
            title: 'Last Updated',
            type: 'datetime',
            description: 'When the scraper last refreshed this snapshot.',
            readOnly: true,
        }),
        defineField({
            name: 'playoffs',
            title: 'Playoff Matches',
            description:
                'Auto-populated by the scraper from notes like "Semi-Final #1", "Final", "Third Place". Used to render the bracket on /standings/[season]. Safe to hand-edit if rugbyfl misclassifies a match.',
            type: 'array',
            of: [
                defineField({
                    name: 'playoffMatch',
                    type: 'object',
                    title: 'Playoff Match',
                    fields: [
                        defineField({
                            name: 'round',
                            title: 'Round',
                            type: 'string',
                            options: {
                                list: [
                                    { title: 'Quarter-Final', value: 'quarter' },
                                    { title: 'Semi-Final', value: 'semi' },
                                    { title: 'Final', value: 'final' },
                                    { title: 'Third Place', value: 'third' },
                                ],
                            },
                            validation: (rule) => rule.required(),
                        }),
                        defineField({
                            name: 'label',
                            title: 'Label',
                            type: 'string',
                            description: 'Raw note from rugbyfl, e.g. "Semi-Final #1".',
                        }),
                        defineField({ name: 'date', title: 'Date', type: 'date' }),
                        defineField({ name: 'homeTeam', title: 'Home Team', type: 'string' }),
                        defineField({ name: 'awayTeam', title: 'Away Team', type: 'string' }),
                        defineField({ name: 'homeScore', title: 'Home Score', type: 'number' }),
                        defineField({ name: 'awayScore', title: 'Away Score', type: 'number' }),
                    ],
                    preview: {
                        select: {
                            round: 'round',
                            label: 'label',
                            home: 'homeTeam',
                            away: 'awayTeam',
                            hs: 'homeScore',
                            as: 'awayScore',
                        },
                        prepare({ round, label, home, away, hs, as }) {
                            const score =
                                typeof hs === 'number' && typeof as === 'number' ? ` ${hs}–${as}` : ''
                            return {
                                title: `${home || '?'} vs ${away || '?'}${score}`,
                                subtitle: label || round,
                            }
                        },
                    },
                }),
            ],
        }),
        defineField({
            name: 'rows',
            title: 'Standings Rows',
            type: 'array',
            of: [
                defineField({
                    name: 'row',
                    type: 'object',
                    title: 'Standing Row',
                    fields: [
                        defineField({ name: 'position', title: 'Position', type: 'number' }),
                        defineField({ name: 'teamName', title: 'Team Name', type: 'string' }),
                        defineField({ name: 'pool', title: 'Pool', type: 'string', description: 'e.g. "North", "South", "Combo", "Unique"' }),
                        defineField({ name: 'played', title: 'Played', type: 'number' }),
                        defineField({ name: 'won', title: 'Won', type: 'number' }),
                        defineField({ name: 'lost', title: 'Lost', type: 'number' }),
                        defineField({ name: 'drawn', title: 'Drawn', type: 'number' }),
                        defineField({ name: 'pointsFor', title: 'Points For', type: 'number' }),
                        defineField({ name: 'pointsAgainst', title: 'Points Against', type: 'number' }),
                        defineField({ name: 'pointsDifference', title: 'Points Difference', type: 'number' }),
                        defineField({ name: 'bonusPoints', title: 'Bonus Points', type: 'number' }),
                        defineField({ name: 'totalPoints', title: 'Total Points', type: 'number' }),
                    ],
                    preview: {
                        select: {
                            pos: 'position',
                            team: 'teamName',
                            pool: 'pool',
                            tp: 'totalPoints',
                        },
                        prepare({ pos, team, pool, tp }) {
                            return {
                                title: `${pos}. ${team || '(unknown team)'}`,
                                subtitle: `${pool || '—'} · ${tp ?? 0} pts`,
                            }
                        },
                    },
                }),
            ],
        }),
    ],
    preview: {
        select: {
            season: 'seasonLabel',
            division: 'divisionName',
            cid: 'championshipId',
            updated: 'lastUpdated',
        },
        prepare({ season, division, cid, updated }) {
            const date = updated ? new Date(updated).toLocaleDateString() : 'never'
            return {
                title: `${division || 'Standings'} · ${season || ''}`.trim(),
                subtitle: `Championship_ID=${cid} · updated ${date}`,
            }
        },
    },
    orderings: [
        {
            title: 'Season (newest first)',
            name: 'seasonDesc',
            by: [{ field: 'seasonLabel', direction: 'desc' }],
        },
    ],
})
