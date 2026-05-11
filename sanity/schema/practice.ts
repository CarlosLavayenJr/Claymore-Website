import { defineField, defineType } from 'sanity'

export const practice = defineType({
    name: 'practice',
    title: 'Practice',
    type: 'document',
    fields: [
        defineField({
            name: 'active',
            title: 'Active (show on calendar)',
            type: 'boolean',
            description:
                'Master on/off switch. Uncheck to hide this practice from the site without deleting it.',
            initialValue: true,
        }),
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            description: 'e.g. "Weekly Training", "Backs Session"',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'icon',
            title: 'Calendar Icon',
            type: 'image',
            description: 'Shown in the calendar cell. Upload the Claymores logo.',
            options: { hotspot: true },
            fields: [
                defineField({
                    name: 'alt',
                    title: 'Alt text',
                    type: 'string',
                }),
            ],
        }),
        defineField({
            name: 'startDate',
            title: 'Start Date',
            type: 'date',
            description:
                'First date the practice occurs. For recurring practices, instances generate on or after this date.',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'time',
            title: 'Time',
            type: 'string',
            description: 'Free-text, e.g. "6:30 PM – 8:00 PM"',
        }),
        defineField({
            name: 'address',
            title: 'Address',
            type: 'string',
            description: 'e.g. "Barnett Park, Orlando, FL"',
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            rows: 4,
            description: 'Optional extra details shown in the popover.',
        }),
        defineField({
            name: 'recurring',
            title: 'Recurring',
            type: 'boolean',
            description:
                'When checked, the practice repeats weekly on the selected weekdays until this doc is deactivated.',
            initialValue: false,
        }),
        defineField({
            name: 'weekdays',
            title: 'Weekdays',
            type: 'array',
            of: [{ type: 'string' }],
            options: {
                list: [
                    { title: 'Sunday', value: 'sun' },
                    { title: 'Monday', value: 'mon' },
                    { title: 'Tuesday', value: 'tue' },
                    { title: 'Wednesday', value: 'wed' },
                    { title: 'Thursday', value: 'thu' },
                    { title: 'Friday', value: 'fri' },
                    { title: 'Saturday', value: 'sat' },
                ],
            },
            description: 'Days of the week this practice repeats. Only used when "Recurring" is on.',
            hidden: ({ parent }) => !parent?.recurring,
        }),
    ],
    preview: {
        select: {
            title: 'title',
            startDate: 'startDate',
            time: 'time',
            recurring: 'recurring',
            active: 'active',
            media: 'icon',
        },
        prepare({ title, startDate, time, recurring, active }) {
            const parts = [
                startDate,
                time,
                recurring ? 'recurring' : 'one-time',
                !active ? 'inactive' : null,
            ].filter(Boolean)
            return {
                title: title || 'Practice',
                subtitle: parts.join(' · '),
            }
        },
    },
    orderings: [
        {
            title: 'Start Date',
            name: 'startDateAsc',
            by: [{ field: 'startDate', direction: 'asc' }],
        },
    ],
})
