export const GRAPHIC_TEMPLATES = [
    { title: 'Lineup — featured player', value: 'featured' },
    { title: 'Lineup — three players', value: 'threePlayers' },
    { title: 'Lineup — position map', value: 'pitch' },
    { title: 'Final score', value: 'finalScore' },
] as const

export type GraphicTemplate = (typeof GRAPHIC_TEMPLATES)[number]['value']
export type Reference = { _ref?: string }
export type SanityImage = { asset?: Reference }
export type LineupSlot = { _key?: string; number?: number; player?: Reference; role?: 'captain' | 'viceCaptain' }
export type GraphicsDocument = {
    _id?: string
    title?: string
    match?: Reference
    clubSide?: 'home' | 'away'
    template?: GraphicTemplate
    lineup?: LineupSlot[]
    featuredPlayers?: Reference[]
    background?: SanityImage
}
export type PlayerRecord = {
    _id: string
    name?: string
    graphicName?: string
    active?: boolean
    eligiblePositions?: number[]
    cutoutUrl?: string
}
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

export function buildGraphicData(doc: GraphicsDocument, match: MatchRecord | undefined, players: PlayerRecord[], background?: string) {
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
    const playerData = (ref?: Reference, number?: number, role?: LineupSlot['role']): GraphicPlayer => {
        const p = byId.get(publishedId(ref?._ref ?? ''))
        return { id: ref?._ref ?? '', name: p?.graphicName?.trim() || p?.name?.trim() || 'UNASSIGNED', photo: p?.cutoutUrl, number, role }
    }
    const slots = doc.lineup ?? []
    const lineup = slots.map(s => playerData(s.player, s.number, s.role)).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    const featured = (doc.featuredPlayers ?? []).map(p => playerData(p))
    if (template !== 'finalScore') {
        errors.push(...lineupProblems(slots, true))
        for (const s of slots) {
            const p = byId.get(publishedId(s.player?._ref ?? ''))
            if (s.player?._ref && !p) errors.push(`Player at position ${s.number} could not be loaded.`)
            if (p?.active === false) warnings.push(`${p.name} is marked inactive.`)
            if (s.number && s.number <= 15 && p?.eligiblePositions?.length && !p.eligiblePositions.includes(s.number)) {
                warnings.push(`${p.name} is outside their saved eligible positions at ${s.number}.`)
            }
        }
        if (template === 'pitch') {
            for (const p of lineup.filter(p => (p.number ?? 0) <= 15)) if (!p.photo) errors.push(`Upload a transparent body shot for ${p.name}.`)
        } else {
            const count = template === 'threePlayers' ? 3 : 1
            if (featured.length !== count) errors.push(`Select exactly ${count} featured player${count === 1 ? '' : 's'}.`)
            const ids = featured.map(p => publishedId(p.id))
            if (new Set(ids).size !== ids.length) errors.push('Featured players must be different.')
            for (const p of featured) {
                if (!lineup.some(l => publishedId(l.id) === publishedId(p.id))) errors.push(`${p.name} must be in this match lineup to be featured.`)
                if (!p.photo) errors.push(`Upload a transparent body shot for ${p.name}.`)
            }
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
