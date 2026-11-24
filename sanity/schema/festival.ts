import { defineField, defineType } from 'sanity'

export const festival = defineType({
    name: 'festival',
    title: 'Rugby Festival',
    type: 'document',
    fields: [
        defineField({ name: 'active', title: 'Show on calendar', type: 'boolean', initialValue: true }),
        defineField({ name: 'title', title: 'Title', type: 'string', validation: r => r.required() }),
        defineField({ name: 'startDate', title: 'Date', type: 'date', validation: r => r.required() }),
        defineField({ name: 'time', title: 'First kickoff', type: 'string' }),
        defineField({ name: 'venue', title: 'Venue', type: 'string' }),
        defineField({ name: 'address', title: 'Venue address', type: 'string' }),
        defineField({ name: 'icon', title: 'Calendar icon', type: 'image', fields: [{ name: 'alt', title: 'Alt text', type: 'string' }] }),
        defineField({ name: 'description', title: 'Format and details', type: 'text', rows: 6 }),
        defineField({ name: 'participants', title: 'Participating sides', type: 'array', of: [{ type: 'string' }] }),
        defineField({
            name: 'results', title: 'Match results', type: 'array',
            description: 'Add each game after the festival. Leave scores empty until confirmed.',
            of: [{ type: 'object', name: 'festivalResult', title: 'Game', fields: [
                defineField({ name: 'label', title: 'Round / game label', type: 'string' }),
                defineField({ name: 'homeTeam', title: 'Home team', type: 'string', validation: r => r.required() }),
                defineField({ name: 'awayTeam', title: 'Away team', type: 'string', validation: r => r.required() }),
                defineField({ name: 'homeScore', title: 'Home score', type: 'number', validation: r => r.integer().min(0) }),
                defineField({ name: 'awayScore', title: 'Away score', type: 'number', validation: r => r.integer().min(0) }),
            ], preview: { select: { title: 'label', subtitle: 'awayTeam' } } }],
        }),
        defineField({ name: 'socialVenue' , title: 'Post tournament social venue', type: 'string' }),
        defineField({ name: 'socialAddress', title: 'Social address', type: 'string' }),
    ],
    preview: { select: { title: 'title', subtitle: 'startDate', media: 'icon' } },
    orderings: [{ title: 'Date', name: 'dateAsc', by: [{ field: 'startDate', direction: 'asc' }] }],
})
