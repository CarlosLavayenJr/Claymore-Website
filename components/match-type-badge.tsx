import type { SanityMatch } from '@/sanity/lib/queries'

interface Props {
    matchType: SanityMatch['matchType']
    /** When `compact`, renders a smaller pill suitable for inline placement. */
    size?: 'default' | 'compact'
    /**
     * `inline` (default) — Only friendlies render ("Friendly"); league/missing
     * renders nothing. Use beside team names so league matches stay quiet.
     *
     * `abbreviated` — Both render with two-letter labels ("Fr"/division code),
     * tuned for narrow table columns. Missing matchType is treated as league.
     */
    variant?: 'inline' | 'abbreviated'
    /**
     * Optional division code (e.g. "D3", "D4") used in place of the generic
     * "Lg" label when rendering a league match in `abbreviated` variant.
     */
    leagueLabel?: string
    className?: string
}

const FRIENDLY_CLASSES = 'bg-[#fd80b5]/10 text-[#fd80b5] border-[#fd80b5]/30'
const LEAGUE_CLASSES = 'bg-[#77c3ef]/10 text-[#77c3ef] border-[#77c3ef]/30'

/**
 * Pink pill for friendlies, steel-blue pill for league. The default `inline`
 * variant only renders friendlies (so league rows stay visually quiet); the
 * `abbreviated` variant renders both as "Fr"/"Lg" for table columns.
 */
export default function MatchTypeBadge({
    matchType,
    size = 'default',
    variant = 'inline',
    leagueLabel,
    className = '',
}: Props) {
    const isFriendly = matchType === 'friendly'

    if (variant === 'inline' && !isFriendly) return null

    const sizing =
        size === 'compact'
            ? 'text-[9px] px-1.5 py-0.5'
            : 'text-[10px] px-2 py-0.5'

    if (variant === 'abbreviated') {
        const label = isFriendly ? 'Fr' : leagueLabel ?? 'Lg'
        const colors = isFriendly ? FRIENDLY_CLASSES : LEAGUE_CLASSES
        const tooltip = isFriendly ? 'Friendly' : leagueLabel ? `${leagueLabel} League` : 'League'
        return (
            <span
                title={tooltip}
                className={`inline-block font-bold uppercase tracking-widest rounded border ${colors} ${sizing} ${className}`}
            >
                {label}
            </span>
        )
    }

    return (
        <span
            className={`inline-block font-bold uppercase tracking-widest rounded border ${FRIENDLY_CLASSES} ${sizing} ${className}`}
        >
            Friendly
        </span>
    )
}
