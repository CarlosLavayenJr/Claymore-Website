import { defineField, defineType } from 'sanity'

export const coach = defineType({
    name: 'coach',
    title: 'Coach / Staff',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Name',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: { source: 'name' },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'role',
            title: 'Role',
            type: 'string',
            description: 'e.g. "Head Coach", "Forwards Coach", "Founder & Coach", "President"',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'order',
            title: 'Display Order',
            type: 'number',
            description: 'Lower numbers display first on /coaches.',
            initialValue: 100,
        }),
        defineField({
            name: 'active',
            title: 'Active',
            type: 'boolean',
            initialValue: true,
        }),
        defineField({
            name: 'image',
            title: 'Photo',
            type: 'image',
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
            name: 'bio',
            title: 'Bio',
            type: 'text',
            rows: 6,
        }),
        defineField({
            name: 'credentials',
            title: 'Credentials / Background',
            type: 'array',
            of: [{ type: 'string' }],
            description:
                'Short bullet credentials (e.g. "USA Rugby Level 200 Certified", "Played D1 at University of X"). Used for SEO + Person schema.',
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'role',
            media: 'image',
        },
    },
    orderings: [
        {
            title: 'Display Order',
            name: 'orderAsc',
            by: [{ field: 'order', direction: 'asc' }],
        },
    ],
})
