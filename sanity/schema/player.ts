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
            fields: [
                defineField({
                    name: 'alt',
                    title: 'Alt text',
                    type: 'string',
                    description:
                        'Describe what is visible in the photo (e.g. "John Smith carrying the ball through a tackle"). Falls back to player name when empty.',
                }),
            ],
        }),
        defineField({
            name: 'graphicName',
            title: 'Name on graphics',
            type: 'string',
            description: 'Optional short display name. Falls back to Name; does not change the website player name.',
            validation: (rule) => rule.max(32),
        }),
        defineField({
            name: 'cutout',
            title: 'Body-shot cutout for graphics',
            type: 'image',
            options: { accept: 'image/png,image/webp' },
            description: 'Upload a transparent PNG or WebP with the whole player visible, including boots. The original website photo is kept separately.',
        }),
        defineField({
            name: 'eligiblePositions',
            title: 'Eligible position numbers',
            type: 'array',
            of: [{ type: 'number', validation: (rule) => rule.integer().min(1).max(15) }],
            validation: (rule) => rule.unique(),
            description: 'Optional 1–15 position numbers. The graphics preview warns when a player is selected outside these positions.',
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
