import { defineField, defineType } from 'sanity'

export const team = defineType({
    name: 'team',
    title: 'Team',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Team Name',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'image',
            title: 'Team Logo',
            type: 'image',
            options: { hotspot: true },
            validation: (rule) => rule.required(),
            fields: [
                defineField({
                    name: 'alt',
                    title: 'Alt text',
                    type: 'string',
                    description: 'Describe the logo. Falls back to "[Team] logo" when empty.',
                }),
            ],
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: { source: 'name' },
            description: 'URL slug for /opponents/[slug]. Generate from team name.',
        }),
        defineField({
            name: 'city',
            title: 'City',
            type: 'string',
            description: 'Their home city/region (e.g. "Jacksonville, FL"). Used on opponent pages.',
        }),
        defineField({
            name: 'website',
            title: 'Website',
            type: 'url',
        }),
        defineField({
            name: 'aliases',
            title: 'Name Aliases',
            type: 'array',
            of: [{ type: 'string' }],
            description: 'Short names or variations used in match records (e.g. "Brevard", "Brevard RFC")',
        }),
        defineField({
            name: 'description',
            title: 'Notes / Description',
            type: 'text',
            rows: 4,
            description: 'Optional notes about this team',
        }),
    ],
    preview: {
        select: {
            title: 'name',
            media: 'image',
        },
    },
})
