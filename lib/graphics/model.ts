export const GRAPHIC_TEMPLATES = [
    { title: 'Lineup — featured player', value: 'featured' },
    { title: 'Lineup — three players', value: 'threePlayers' },
    { title: 'Lineup — position map', value: 'pitch' },
    { title: 'Final score', value: 'finalScore' },
] as const

export type GraphicTemplate = (typeof GRAPHIC_TEMPLATES)[number]['value']
export type Reference = { _ref?: string }
export type SanityImage = { asset?: Reference }
export type LineupSlot = { _key?: string; number?: number; player?: Reference; photo?: SanityImage; featured?: boolean; role?: 'captain' | 'viceCaptain' }
export type GraphicsDocument = {
    _id?: string
    title?: string
    match?: Reference
    clubSide?: 'home' | 'away'
    template?: GraphicTemplate
    lineup?: LineupSlot[]
    background?: SanityImage
}
export type PlayerRecord = {
    _id: string
    name?: string
    graphicName?: string
    active?: boolean
    eligiblePositions?: number[]
    cutouts?: PhotoRecord[]
}
/** A transparent body shot. `hasAlpha` comes from Sanity's asset metadata. */
export type PhotoRecord = { assetId?: string; url?: string; hasAlpha?: boolean }
export type TeamRecord = { _id?: string; name?: string; logoUrl?: string }
export type MatchRecord = {
    _id: string
    date?: string
    kickoffTime?: string
    venue?: string
    homeTeam?: string
    awayTeam?: string
    homeScore?: number
    awayScore?: number
    status?: string
    competition?: string
    homeTeamRef?: TeamRecord
    awayTeamRef?: TeamRecord
}
export type GraphicPlayer = {
    id: string
    name: string
    number?: number
    role?: LineupSlot['role']
    photo?: string
}
type ResolvedPhoto = { photo?: PhotoRecord; missing: boolean }
export type GraphicData = {
    template: GraphicTemplate
    date: string
    kickoff: string
    venue: string
    competition: string
    opponent: string
    opponentLogo?: string
    clubLogo?: string
    clubScore?: number
    opponentScore?: number
    lineup: GraphicPlayer[]
    featured: GraphicPlayer[]
    background?: string
}
export function publishedId(id: string) { return id.replace(/^drafts\./, '') }

/** Shared by Sanity validation and export, including drafts and imported data. */
export function lineupProblems(slots: LineupSlot[] = [], requireStartingXV = false): string[] {
    const issues: string[] = []
    const numbers = new Set<number>()
    const players = new Set<string>()
    const roles = new Set<string>()
    for (const slot of slots) {
        const number = slot.number
        if (!Number.isInteger(number) || number! < 1 || number! > 23) {
            issues.push('Every lineup slot needs a number from 1 to 23.')
        } else {
            if (numbers.has(number!)) issues.push(`Position ${number} is assigned more than once.`)
            numbers.add(number!)
        }
        if (!slot.player?._ref) issues.push(`Select a player for position ${number ?? '?'}.`)
        else {
            const id = publishedId(slot.player._ref)
            if (players.has(id)) issues.push('A player cannot occupy more than one position.')
            players.add(id)
        }
        if (slot.role) {
            if (roles.has(slot.role)) issues.push(`Only one ${slot.role === 'captain' ? 'captain' : 'vice-captain'} may be selected.`)
            roles.add(slot.role)
        }
    }
    if (requireStartingXV) {
        const missing = Array.from({ length: 15 }, (_, i) => i + 1).filter(n => !numbers.has(n))
        if (missing.length) issues.push(`Assign the starting XV: missing ${missing.join(', ')}.`)
    }
    return [...new Set(issues)]
}

export function buildGraphicData(doc: GraphicsDocument, match: MatchRecord | undefined, players: PlayerRecord[], background?: string, photos: PhotoRecord[] = []) {
    const errors: string[] = []
    const warnings: string[] = []
    const template = doc.template ?? 'featured'
    if (!GRAPHIC_TEMPLATES.some(t => t.value === template)) errors.push('Choose a supported graphic template.')
    if (!doc.match?._ref || !match) errors.push('Select an existing match.')
    if (doc.clubSide !== 'home' && doc.clubSide !== 'away') errors.push('Choose whether Claymores are the home or away team.')
    const parsedDate = match?.date ? new Date(`${match.date}T12:00:00Z`) : undefined
    if (!match?.date || !/^\d{4}-\d{2}-\d{2}$/.test(match.date) || !parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== match.date) errors.push('Set a valid date on the linked match.')
    if (!match?.venue?.trim()) errors.push('Set the venue on the linked match.')
    if (template !== 'finalScore' && !match?.kickoffTime?.trim()) errors.push('Set kickoff time on the linked match.')
    const away = doc.clubSide === 'away'
    const opponent = away ? match?.homeTeam : match?.awayTeam
    const opponentTeam = away ? match?.homeTeamRef : match?.awayTeamRef
    const clubTeam = away ? match?.awayTeamRef : match?.homeTeamRef
    if (!opponent?.trim()) errors.push('The linked match needs an opponent name.')
    if (!opponentTeam?.logoUrl) errors.push('Link the opponent team and its logo on the match.')
    const byId = new Map(players.map(p => [publishedId(p._id), p]))
    const photoById = new Map(photos.filter(p => p.assetId).map(p => [p.assetId!, p]))
    // A slot's chosen photo wins; otherwise the player's first cutout is used.
    const resolvePhoto = (slot: LineupSlot, p?: PlayerRecord): ResolvedPhoto => {
        const ref = slot.photo?.asset?._ref
        if (!ref) return { photo: p?.cutouts?.find(c => c.url), missing: false }
        const photo = photoById.get(ref) ?? p?.cutouts?.find(c => c.assetId === ref)
        return { photo: photo?.url ? photo : undefined, missing: !photo?.url }
    }
    const slots = doc.lineup ?? []
    const resolved = slots.map(slot => {
        const p = byId.get(publishedId(slot.player?._ref ?? ''))
        const { photo, missing } = resolvePhoto(slot, p)
        const player: GraphicPlayer = { id: slot.player?._ref ?? '', name: p?.graphicName?.trim() || p?.name?.trim() || 'UNASSIGNED', photo: photo?.url, number: slot.number, role: slot.role }
        return { slot, record: p, player, photo, missing }
    }).sort((a, b) => (a.slot.number ?? 0) - (b.slot.number ?? 0))
    const lineup = resolved.map(r => r.player)
    const featuredSlots = resolved.filter(r => r.slot.featured)
    const featured = featuredSlots.map(r => r.player)
    const requirePhoto = ({ player, photo, missing }: (typeof resolved)[number]) => {
        if (missing) errors.push(`The photo selected for ${player.name} could not be loaded. Choose another.`)
        else if (!photo) errors.push(`Choose a transparent body shot for ${player.name}.`)
        else if (photo.hasAlpha === false) errors.push(`The photo for ${player.name} has a background. Choose a transparent cutout.`)
    }
    if (template !== 'finalScore') {
        errors.push(...lineupProblems(slots, true))
        for (const { slot: s, record: p } of resolved) {
            if (s.player?._ref && !p) errors.push(`Player at position ${s.number} could not be loaded.`)
            if (p?.active === false) warnings.push(`${p.name} is marked inactive.`)
            if (s.number && s.number <= 15 && p?.eligiblePositions?.length && !p.eligiblePositions.includes(s.number)) {
                warnings.push(`${p.name} is outside their saved eligible positions at ${s.number}.`)
            }
        }
        if (template === 'pitch') {
            for (const r of resolved.filter(r => (r.slot.number ?? 0) <= 15)) requirePhoto(r)
        } else {
            const count = template === 'threePlayers' ? 3 : 1
            if (featured.length !== count) errors.push(`Mark exactly ${count} lineup player${count === 1 ? '' : 's'} as featured (currently ${featured.length}).`)
            for (const r of featuredSlots) requirePhoto(r)
        }
    }
    const clubScore = away ? match?.awayScore : match?.homeScore
    const opponentScore = away ? match?.homeScore : match?.awayScore
    if (template === 'finalScore') {
        if (match?.status !== 'played') errors.push('Final-score export requires the linked match status to be Played.')
        if (![clubScore, opponentScore].every(s => Number.isInteger(s) && s! >= 0)) errors.push('Enter valid non-negative final scores on the match.')
    }
    if (doc.background?.asset?._ref && !background) errors.push('The selected background image could not be loaded.')
    const data: GraphicData = {
        template, date: match?.date ?? '', kickoff: match?.kickoffTime ?? '', venue: match?.venue ?? '',
        competition: match?.competition ?? "MEN'S DIVISION 3", opponent: opponent ?? 'OPPONENT',
        opponentLogo: opponentTeam?.logoUrl, clubLogo: clubTeam?.logoUrl ?? '/assets/Claymoresvertical.png',
        clubScore, opponentScore, lineup, featured, background,
    }
    return { data, errors: [...new Set(errors)], warnings: [...new Set(warnings)] }
}
