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
