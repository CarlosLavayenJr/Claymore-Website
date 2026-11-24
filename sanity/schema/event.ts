import { defineField, defineType } from 'sanity'

export const event = defineType({
    name: 'event', title: 'Club Event', type: 'document',
    fields: [
        defineField({ name: 'active', title: 'Show on calendar', type: 'boolean', initialValue: true }),
        defineField({ name: 'title', title: 'Title', type: 'string', validation: r => r.required() }),
        defineField({ name: 'startDate', title: 'Date', type: 'date', validation: r => r.required() }),
        defineField({ name: 'time', title: 'Time', type: 'string' }),
        defineField({ name: 'venue', title: 'Venue', type: 'string' }),
        defineField({ name: 'address', title: 'Address', type: 'string' }),
        defineField({ name: 'description', title: 'Details', type: 'text' }),
        defineField({ name: 'icon', title: 'Calendar icon', type: 'image', fields: [{ name: 'alt', title: 'Alt text', type: 'string' }] }),
    ],
    preview: { select: { title: 'title', subtitle: 'startDate', media: 'icon' } },
})
