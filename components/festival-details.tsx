import Link from 'next/link'
import Breadcrumbs from '@/components/breadcrumbs'
import type { SanityPractice, SanityTeam } from '@/sanity/lib/queries'
import { resolveTeam } from '@/lib/teams'
import { festivalSlug } from '@/lib/festivals'
import { formatMatchDateLong } from '@/lib/seo'

function MapLink({ address }: { address: string }) {
    return <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[#555555] hover:text-[#111111] underline decoration-[#77c3ef] underline-offset-4">{address}</a>
}

function FestivalTeam({ name, teams, compact = false }: { name: string; teams: SanityTeam[]; compact?: boolean }) {
    const baseName = name.replace(/\s*[—–-]\s*side\s*\d+$/i, '')
    const team = resolveTeam(baseName, teams)
    const href = team.isClaymores ? '/team' : team.slug ? `/opponents/${team.slug}` : null
    const side = name.match(/[—–-]\s*side\s*\d+$/i)?.[0]
    const label = side ? `${team.name} ${side}` : team.name
    const content = <>
        {team.logoUrl ? <img src={team.logoUrl} alt={team.logoAlt ?? `${team.name} logo`} className={compact ? 'w-10 h-10 object-contain shrink-0' : 'w-16 h-16 md:w-24 md:h-24 mx-auto object-contain'} /> : <div className={compact ? 'w-10 h-10 rounded-full bg-[#EAEAEA] shrink-0' : 'w-16 h-16 md:w-24 md:h-24 mx-auto rounded-full bg-[#EAEAEA]'} />}
        <p className={`${compact ? 'text-sm' : 'mt-3 text-sm md:text-lg'} font-bold ${href ? 'text-[#77c3ef] group-hover:underline' : 'text-[#111111]'}`}>{label}</p>
    </>
    const className = compact ? 'group flex items-center gap-3 hover:opacity-80 transition-opacity' : 'group block text-center hover:opacity-80 transition-opacity'
    return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>
}

export default function FestivalDetails({ event, teams, preview = false }: { event: SanityPractice; teams: SanityTeam[]; preview?: boolean }) {
    return (
        <main className="container mx-auto px-4 py-12 max-w-4xl">
            <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Fixtures', path: '/fixtures' }, { name: event.title, path: `/fixtures/${festivalSlug(event)}` }]} />
            <header className="text-center bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fd80b5] mb-4">{event.eventType === 'event' ? 'Club event' : 'Rugby festival'}</p>
                {event.iconUrl && <img src={event.iconUrl} alt={event.iconAlt ?? 'Central Florida Claymores'} className="w-20 h-20 object-contain mx-auto mb-5" />}
                <h1 className="font-claymore text-4xl sm:text-6xl text-[#111111]">{event.title}</h1>
                <p className="text-xs uppercase tracking-widest text-[#555555] mt-5">Central Florida Claymores RFC · Orlando Rugby</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-[#EAEAEA] text-left">
                    <div>
                        <dt className="text-xs uppercase tracking-wider font-semibold text-[#555555] mb-1">Date</dt>
                        <dd className="text-sm text-[#111111]">{formatMatchDateLong(event.startDate)}</dd>
                        {event.time && <dd className="text-sm text-[#555555] mt-1">{event.time}</dd>}
                    </div>
                    {(event.venue || event.address) && <div>
                        <dt className="text-xs uppercase tracking-wider font-semibold text-[#555555] mb-1">Venue</dt>
                        {event.venue && <dd className="text-sm text-[#111111] mb-1">{event.venue}</dd>}
                        {event.address && <dd><MapLink address={event.address} /></dd>}
                    </div>}
                </dl>
            </header>
            {event.eventType !== 'event' && <section className="py-8 border-b border-[#EAEAEA]">
                <h2 className="font-claymore text-2xl text-[#111111] mb-4">Festival results</h2>
                {preview && <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#555555] border-l-2 border-[#fd80b5] pl-3">Preview · Sample scores only · Not official results</p>}
                {event.results?.length ? <div className="space-y-4">
                    {event.results.map(result => {
                        const final = result.homeScore != null && result.awayScore != null
                        const home = resolveTeam(result.homeTeam, teams)
                        const away = resolveTeam(result.awayTeam, teams)
                        const ours = home.isClaymores ? result.homeScore : result.awayScore
                        const theirs = home.isClaymores ? result.awayScore : result.homeScore
                        const outcome = final && (home.isClaymores || away.isClaymores)
                            ? ours === theirs ? 'DRAW' : ours! > theirs! ? 'WIN' : 'LOSS' : null
                        return (
                            <div key={result._key} className="bg-white border border-[#EAEAEA] rounded-2xl p-6 md:p-10">
                                <div className="flex justify-between items-center gap-3 mb-4">
                                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold">{result.label ?? 'Festival game'}</p>
                                    {outcome && <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${outcome === 'WIN' ? 'bg-[#77c3ef] text-[#0b1c25]' : outcome === 'DRAW' ? 'bg-[#fd80b5] text-[#3a0a23]' : 'bg-[#111111] text-white'}`}>{outcome}</span>}
                                </div>
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 my-6">
                                    <FestivalTeam name={result.homeTeam} teams={teams} />
                                    <div className="text-center">
                                        {final ? <p className="font-claymore text-4xl sm:text-5xl md:text-7xl text-[#111111] leading-none">{result.homeScore}<span className="mx-2 text-[#EAEAEA]">–</span>{result.awayScore}</p> : <p className="font-claymore text-3xl md:text-5xl text-[#111111] leading-none">vs</p>}
                                        <p className="mt-3 text-xs uppercase tracking-wider text-[#555555]">{final ? 'Final' : 'Upcoming'}</p>
                                    </div>
                                    <FestivalTeam name={result.awayTeam} teams={teams} />
                                </div>
                            </div>
                        )
                    })}
                </div> : <p className="text-sm text-[#555555]">Results will be posted after the festival.</p>}
            </section>}
            <div className="grid sm:grid-cols-[1.4fr_1fr] gap-10 py-10">
                <section>
                    <h2 className="font-claymore text-2xl text-[#111111] mb-4">{event.eventType === 'event' ? 'Event details' : 'Festival format'}</h2>
                    {event.description && <p className="text-sm leading-7 whitespace-pre-line text-[#555555]">{event.description}</p>}
                    {!!event.participants?.length && <>
                        <h2 className="font-claymore text-2xl text-[#111111] mt-8 mb-4">Participating sides</h2>
                        <ul className="divide-y divide-[#EAEAEA]">{event.participants.map((team, index) => <li key={`${team}-${index}`} className="py-3"><FestivalTeam name={team} teams={teams} compact /></li>)}</ul>
                    </>}
                </section>
                <div className="space-y-8">
                    {(event.socialVenue || event.socialAddress) && <section className="rounded-lg border border-[#EAEAEA] p-6">
                        <p className="text-xs uppercase tracking-widest font-semibold text-[#fd80b5] mb-3">After the rugby</p>
                        <h2 className="font-claymore text-2xl text-[#111111] mb-4">Post tournament social</h2>
                        {event.socialVenue && <p className="text-sm font-semibold text-[#111111] mb-2">{event.socialVenue}</p>}
                        {event.socialAddress && <MapLink address={event.socialAddress} />}
                    </section>}
                </div>
            </div>
            <Link href="/fixtures" className="text-sm text-[#fd80b5] hover:underline">← Back to fixtures</Link>
        </main>
    )
}
