import { defineArrayMember, defineField, defineType } from 'sanity'
import { LineupInput } from '@/sanity/components/graphics/LineupInput'
import { PhotoPickerInput } from '@/sanity/components/graphics/PhotoPickerInput'
import { MatchGraphicsPreview } from '@/sanity/components/graphics/MatchGraphicsPreview'
import { GRAPHIC_TEMPLATES, lineupProblems, type LineupSlot } from '@/lib/graphics/model'

export const matchGraphics = defineType({
    name: 'matchGraphics',
    title: 'Match Graphics',
    type: 'document',
    groups: [
        { name: 'match', title: 'Match & design', default: true },
        { name: 'lineup', title: 'Lineup & photos' },
        { name: 'preview', title: 'Preview & download' },
    ],
    fields: [
        defineField({ name: 'title', title: 'Internal title', type: 'string', group: 'match', validation: r => r.required() }),
        defineField({
            name: 'match', title: 'Match', type: 'reference', to: [{ type: 'match' }], group: 'match',
            description: 'Date, kickoff, venue, opponent, crests and final scores come from this match. Open the linked record to edit them.',
            validation: r => r.required(),
        }),
        defineField({
            name: 'clubSide', title: 'Which side are Claymores?', type: 'string', group: 'match',
            options: { list: [{ title: 'Home team', value: 'home' }, { title: 'Away team', value: 'away' }], layout: 'radio' },
            description: 'Required so the correct opponent, crest and score are used.', validation: r => r.required(),
        }),
        defineField({
            name: 'template', title: 'Graphic template', type: 'string', group: 'match',
            options: { list: [...GRAPHIC_TEMPLATES] }, initialValue: 'featured', validation: r => r.required(),
        }),
        defineField({
            name: 'background', title: 'Background photo', type: 'image', group: 'match',
            description: 'Optional team or match photo. The design applies a dark overlay for readable type.',
        }),
        defineField({
            name: 'lineup', title: 'Match lineup', type: 'array', group: 'lineup',
            components: { input: LineupInput },
            description: 'Assign 1–15 for the starting XV; 16–23 are optional replacements. Position numbers determine order, not drag order.',
            of: [defineArrayMember({
                type: 'object', name: 'lineupSlot', title: 'Position assignment',
                fields: [
                    defineField({ name: 'number', title: 'Jersey / position number', type: 'number', validation: r => r.required().integer().min(1).max(23) }),
                    defineField({ name: 'player', title: 'Player', type: 'reference', to: [{ type: 'player' }], options: { disableNew: true }, validation: r => r.required() }),
                    defineField({
                        name: 'photo', title: 'Photo', type: 'image', components: { input: PhotoPickerInput },
                        hidden: ({ parent }) => !parent?.player,
                        description: 'Pick one of this player’s transparent cutouts, or an unassigned one (it is then saved to the player). Empty uses their first cutout.',
                    }),
                    defineField({ name: 'featured', title: 'Feature this player', type: 'boolean', initialValue: false, description: 'Featured player design uses one; Three players uses three.' }),
                    defineField({ name: 'role', title: 'Leadership', type: 'string', options: { list: [{ title: 'Captain', value: 'captain' }, { title: 'Vice-captain', value: 'viceCaptain' }] } }),
                ],
                preview: {
                    select: { number: 'number', name: 'player.name', photo: 'photo', cutout: 'player.cutouts.0', role: 'role', featured: 'featured' },
                    prepare: ({ number, name, photo, cutout, role, featured }) => ({
                        title: `${number ?? '?'} · ${name ?? 'Select player'}`,
                        subtitle: [featured && '★ Featured', role === 'captain' ? 'Captain' : role === 'viceCaptain' ? 'Vice-captain' : undefined].filter(Boolean).join(' · ') || undefined,
                        media: photo?.asset ? photo : cutout,
                    }),
                },
            })],
            validation: r => r.max(23).custom(value => lineupProblems(value as LineupSlot[] | undefined).join(' ') || true),
        }),
        defineField({
            name: 'graphicPreview', title: 'Graphic preview', type: 'string', readOnly: true, group: 'preview',
            components: { input: MatchGraphicsPreview },
        }),
    ],
    preview: {
        select: { title: 'title', template: 'template', date: 'match.date' },
        prepare: ({ title, template, date }) => ({ title: title || 'Match graphics', subtitle: `${date || 'Select match'} · ${template || 'featured'}` }),
    },
})
