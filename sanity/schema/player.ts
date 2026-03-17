import { defineField, defineType } from 'sanity'

export const player = defineType({
    name: 'player',
    title: 'Player',
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
            name: 'mediaTag',
            title: 'Media Tag',
            type: 'reference',
            to: [{ type: 'media.tag' }],
            description: 'The Sanity media tag used to populate this player\'s gallery.',
            options: {
                disableNew: true,
            },
        }),
        defineField({
            name: 'active',
            title: 'Active',
            type: 'boolean',
            initialValue: true,
            description: 'Is this player currently on the active roster?',
        }),
        defineField({
            name: 'position',
            title: 'Position',
            type: 'string',
            options: {
                list: [
                    { title: 'Forward', value: 'Forward' },
                    { title: 'Back', value: 'Back' },
                ],
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'height',
            title: 'Height',
            type: 'string',
        }),
        defineField({
            name: 'weight',
            title: 'Weight',
            type: 'string',
        }),
        defineField({
            name: 'image',
            title: 'Photo',
            type: 'image',
            options: { hotspot: true },
        }),
        defineField({
            name: 'description',
            title: 'Bio',
            type: 'text',
            rows: 4,
        }),
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'position',
            media: 'image',
        },
    },
})
