import { defineField, defineType } from 'sanity'

export const match = defineType({
    name: 'match',
    title: 'Match',
    type: 'document',
    fields: [
        defineField({
            name: 'manualOverride',
            title: 'Manual Override (lock from scraper)',
            type: 'boolean',
            description:
                'When checked, the rugbyfl.com scraper will skip this match entirely. Use this when the official source is wrong (e.g. a cancelled match still shows as upcoming) and you want to preserve your edits.',
            initialValue: false,
        }),
        defineField({
            name: 'date',
            title: 'Date',
            type: 'date',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'season',
            title: 'Season',
            type: 'number',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'homeTeam',
            title: 'Home Team',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'homeScore',
            title: 'Home Score',
            type: 'number',
            initialValue: 0,
        }),
        defineField({
            name: 'awayTeam',
            title: 'Away Team',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'awayScore',
            title: 'Away Score',
            type: 'number',
            initialValue: 0,
        }),
        defineField({
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Played', value: 'played' },
                    { title: 'Upcoming', value: 'upcoming' },
                    { title: 'Cancelled', value: 'cancelled' },
                    { title: 'Forfeit by Claymores', value: 'forfeit_us' },
                    { title: 'Forfeit by Opponent', value: 'forfeit_them' },
                ],
                layout: 'radio',
            },
            initialValue: 'played',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'matchType',
            title: 'Match Type',
            type: 'string',
            options: {
                list: [
                    { title: 'League', value: 'league' },
                    { title: 'Friendly', value: 'friendly' },
                ],
                layout: 'radio',
            },
            initialValue: 'league',
        }),
        defineField({
            name: 'competition',
            title: 'Competition',
            type: 'string',
        }),
        defineField({
            name: 'note',
            title: 'Note',
            type: 'string',
        }),
        defineField({
            name: 'kickoffTime',
            title: 'Kickoff Time',
            type: 'string',
            description: 'e.g. "1:00 PM" — appears on the match page and in SportsEvent schema.',
        }),
        defineField({
            name: 'venue',
            title: 'Venue',
            type: 'string',
            description: 'e.g. "Barnett Park, Orlando, FL". Defaults to home team city when empty.',
        }),
        defineField({
            name: 'recap',
            title: 'Match Recap (overrides auto-generated)',
            type: 'array',
            of: [{ type: 'block' }],
            description:
                'Optional editorial recap. When set, replaces the auto-generated summary on the match page.',
        }),
        defineField({
            name: 'homeTeamRef',
            title: 'Home Team (linked)',
            type: 'reference',
            to: [{ type: 'team' }],
            description: 'Link to a Team document to show their logo',
        }),
        defineField({
            name: 'awayTeamRef',
            title: 'Away Team (linked)',
            type: 'reference',
            to: [{ type: 'team' }],
            description: 'Link to a Team document to show their logo',
        }),
    ],
    preview: {
        select: {
            date: 'date',
            home: 'homeTeam',
            homeScore: 'homeScore',
            away: 'awayTeam',
            awayScore: 'awayScore',
            status: 'status',
        },
        prepare({ date, home, homeScore, away, awayScore, status }) {
            return {
                title: `${home} vs ${away}`,
                subtitle: `${date} — ${status === 'played' ? `${homeScore}–${awayScore}` : status}`,
            }
        },
    },
    orderings: [
        {
            title: 'Date, Newest First',
            name: 'dateDesc',
            by: [{ field: 'date', direction: 'desc' }],
        },
    ],
})
