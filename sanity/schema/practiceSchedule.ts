import { defineField, defineType } from 'sanity'

export const practiceSchedule = defineType({
    name: 'practiceSchedule',
    title: 'Practice Schedule',
    type: 'document',
    description:
        'Site-wide canonical practice schedule. There is only one of these documents — edit it to swap between regular season and summer.',
    fields: [
        defineField({
            name: 'seasonLabel',
            title: 'Season Label',
            type: 'string',
            description:
                'Optional editor-facing label shown alongside the schedule on the site (e.g. "Regular Season", "Summer 2026").',
            initialValue: 'Regular Season',
        }),
        defineField({
            name: 'weekday',
            title: 'Weekday',
            type: 'string',
            description: 'The day of the week practice runs.',
            options: {
                list: [
                    { title: 'Sunday', value: 'Sunday' },
                    { title: 'Monday', value: 'Monday' },
                    { title: 'Tuesday', value: 'Tuesday' },
                    { title: 'Wednesday', value: 'Wednesday' },
                    { title: 'Thursday', value: 'Thursday' },
                    { title: 'Friday', value: 'Friday' },
                    { title: 'Saturday', value: 'Saturday' },
                ],
                layout: 'dropdown',
            },
            validation: (rule) => rule.required(),
            initialValue: 'Thursday',
        }),
        defineField({
            name: 'time',
            title: 'Time',
            type: 'string',
            description: 'e.g. "8–10pm"',
            validation: (rule) => rule.required(),
            initialValue: '8–10pm',
        }),
        defineField({
            name: 'venueName',
            title: 'Venue Name',
            type: 'string',
            description: 'e.g. "Barnett Park"',
            validation: (rule) => rule.required(),
            initialValue: 'Barnett Park',
        }),
        defineField({
            name: 'venueAddress',
            title: 'Venue Address',
            type: 'string',
            description: 'Full street address. e.g. "4801 W Colonial Dr, Orlando, FL 32808"',
            validation: (rule) => rule.required(),
            initialValue: '4801 W Colonial Dr, Orlando, FL 32808',
        }),
        defineField({
            name: 'venueStreet',
            title: 'Venue Street',
            type: 'string',
            description: 'Street portion only, for structured data (e.g. "4801 W Colonial Dr").',
            initialValue: '4801 W Colonial Dr',
        }),
        defineField({
            name: 'venueCity',
            title: 'Venue City',
            type: 'string',
            initialValue: 'Orlando',
        }),
        defineField({
            name: 'venueRegion',
            title: 'Venue State (region code)',
            type: 'string',
            initialValue: 'FL',
        }),
        defineField({
            name: 'venuePostalCode',
            title: 'Venue ZIP',
            type: 'string',
            initialValue: '32808',
        }),
        defineField({
            name: 'mapEmbedUrl',
            title: 'Google Maps Embed URL',
            type: 'url',
            description:
                'The `src` URL for the Google Maps embed iframe on /location. Pin it to the current practice venue.',
            initialValue:
                'https://maps.google.com/maps?q=Barnett+Park,+4801+W+Colonial+Dr,+Orlando,+FL+32808&output=embed',
        }),
        defineField({
            name: 'seasonalNote',
            title: 'Seasonal Note',
            type: 'string',
            description:
                'Short sentence shown next to schedule callouts to flag that the schedule changes seasonally (e.g. "Summer schedule varies — check the fixtures calendar.").',
            initialValue: 'Schedule changes seasonally — check the fixtures calendar for the latest.',
        }),
    ],
    preview: {
        select: {
            season: 'seasonLabel',
            weekday: 'weekday',
            time: 'time',
            venueName: 'venueName',
        },
        prepare({ season, weekday, time, venueName }) {
            return {
                title: season || 'Practice Schedule',
                subtitle: [weekday, time, venueName].filter(Boolean).join(' · '),
            }
        },
    },
})
