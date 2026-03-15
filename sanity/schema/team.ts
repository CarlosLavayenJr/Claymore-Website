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
