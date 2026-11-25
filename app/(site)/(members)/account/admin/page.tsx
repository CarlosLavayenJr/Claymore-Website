import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { approveJoinRequest, createInviteLink, denyJoinRequest, removeInvitation, revokeInviteLink, saveInvitation } from './actions'
import { CopyLink } from './copy-link'
import { MembersSection } from './members-section'
import { DuesSection } from './dues-section'
import { MatchesSection } from './matches-section'
import { AdminSection } from '@/components/members/admin-section'
import { ConfirmSubmit } from '@/components/members/confirm-submit'
import {
    ComingSoon,
    ctaClass,
    formatDate,
    inputClass,
    labelClass,
    linkClass,
    MemberCard,
    MemberHeader,
    Notice,
    RoleBadge,
    secondaryCtaClass,
} from '@/components/members/member-ui'
import { formatCents, type ApiResult, type ClubInvitation, type InviteLink, type JoinRequest } from '@/lib/claymores/api-client'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'
import { memberApi } from '@/lib/claymores/member'
import { shortMatchDate, todayInOrlando, upcomingMatches } from '@/lib/claymores/match-availability'
import { needsFullName } from '@/lib/claymores/member-name'
import { getMatches } from '@/lib/claymores-api'
import { isHomeMatch, opponentOf } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
    title: 'Club admin',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const notices: Record<string, string> = {
    approved: 'Request approved. They can sign in now.',
    denied: 'Request denied.',
    invited: 'Invitation saved.',
    removed: 'Invitation removed.',
    dues_removed: 'Dues removed. They won’t be assigned to that player again automatically.',
    payment_undone: 'Payment undone. It’s crossed out in the history and the balance is back up.',
    payment_undone_card: 'Payment undone in the club’s records. Refund the card payment in the Stripe dashboard to give the money back.',
    note_saved: 'Note saved.',
    link_created: 'New invite link ready. Copy it below and post it in the group chat.',
    link_revoked: 'Invite link turned off. Anyone who already joined keeps their access.',
    name_saved: 'Name saved.',
    lineup_saved: 'Lineup saved as a draft. Only admins can see it.',
    lineup_published: 'Lineup published. Members can see it, and the players in it get a notification.',
}

const errors: Record<string, string> = {
    invalid: 'Check the details and try again.',
    forbidden: 'Only club admins can do that.',
    not_found: 'That item no longer exists. It may have been handled already.',
    not_pending: 'This request was already decided. Refresh to see its current status.',
    conflict: 'That change isn’t allowed. Admins can’t remove or demote themselves.',
    unavailable: 'The club server didn’t respond. Try again in a minute.',
    undo_reason: 'Say why the payment is being undone.',
    payment_invalid: 'Notes are at most 500 characters, and volunteer or waived credits need one.',
    payment_undone: 'That payment was already undone, so it can’t change.',
    name_invalid: 'Enter both a first and a last name (80 characters at most).',
}

const selectClass = `${inputClass} pr-8`
const dangerClass =
    'inline-flex items-center justify-center rounded-md border border-[#fd80b5] px-4 py-2 text-sm font-semibold text-[#b02a64] transition-colors hover:bg-[#fd80b5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:opacity-60'

function RoleSelect({ id, defaultValue = 'player' }: { id: string; defaultValue?: string }) {
    return (
        <select id={id} name="role" defaultValue={defaultValue} className={selectClass}>
            <option value="player">Player</option>
            <option value="admin">Admin</option>
        </select>
    )
}

function JoinRequestRow({ request }: { request: JoinRequest }) {
    const when = formatDate(request.createdAt ?? request.requestedAt ?? null, true)
    return (
        <li className="rounded-lg border border-[#EAEAEA] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-lg font-semibold text-[#111111]">{request.name ?? request.email}</p>
                    <p className="text-sm text-[#555555]">
                        <span className="break-all">{request.email}</span>
                        {request.phone && <span className="whitespace-nowrap"> · {request.phone}</span>}
                    </p>
                </div>
                {when && <p className="text-xs text-[#555555]">Requested {when}</p>}
            </div>
            {request.message && (
                <blockquote className="mt-3 border-l-2 border-[#fd80b5] pl-3 text-sm text-[#555555] whitespace-pre-line">
                    {request.message}
                </blockquote>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={approveJoinRequest.bind(null, request.id)}>
                    <input type="hidden" name="role" value="player" />
                    <button type="submit" className={`${ctaClass} py-2 text-base`}>Approve</button>
                </form>
                <form action={denyJoinRequest.bind(null, request.id)}>
                    <ConfirmSubmit message={`Deny the request from ${request.email}?`} className={dangerClass}>Deny</ConfirmSubmit>
                </form>
            </div>
            <details className="group mt-3">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[#fd80b5] marker:hidden hover:text-[#111111] [&::-webkit-details-marker]:hidden">
                    More options
                </summary>
                <div className="mt-3 grid gap-4 rounded-lg bg-[#fafafa] p-4 md:grid-cols-2">
                    <form action={approveJoinRequest.bind(null, request.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="sm:w-40">
                            <label htmlFor={`approve-role-${request.id}`} className={labelClass}>Approve as</label>
                            <div className="mt-1"><RoleSelect id={`approve-role-${request.id}`} /></div>
                        </div>
                        <button type="submit" className={`${secondaryCtaClass} py-2`}>Approve</button>
                    </form>
                    <form action={denyJoinRequest.bind(null, request.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <label htmlFor={`deny-reason-${request.id}`} className={labelClass}>
                                Deny with a reason <span className="font-normal text-[#555555]">(optional)</span>
                            </label>
                            <input id={`deny-reason-${request.id}`} name="reason" maxLength={500} className={`${inputClass} mt-1`} />
                        </div>
                        <ConfirmSubmit message={`Deny the request from ${request.email}?`} className={dangerClass}>Deny</ConfirmSubmit>
                    </form>
                </div>
            </details>
        </li>
    )
}

function InvitationRow({ invitation, self }: { invitation: ClubInvitation; self: boolean }) {
    return (
        <li className="flex flex-col gap-3 border-b border-[#EAEAEA] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="break-all font-semibold text-[#111111]">
                    {invitation.email} {self && <span className="text-xs font-normal text-[#555555]">(you)</span>}
                </p>
                <div className="mt-1 flex items-center gap-2">
                    <RoleBadge role={invitation.role} />
                    {invitation.invitedAt && (
                        <span className="text-xs text-[#555555]">Invited {formatDate(invitation.invitedAt)}</span>
                    )}
                </div>
            </div>
            {!self && (
                <div className="flex flex-wrap items-end gap-2">
                    <form action={saveInvitation} className="flex items-end gap-2">
                        <input type="hidden" name="email" value={invitation.email} />
                        <label htmlFor={`role-${invitation.email}`} className="sr-only">Role for {invitation.email}</label>
                        <div className="w-32"><RoleSelect id={`role-${invitation.email}`} defaultValue={invitation.role} /></div>
                        <button type="submit" className={`${secondaryCtaClass} py-2 text-sm`}>Save</button>
                    </form>
                    <form action={removeInvitation.bind(null, invitation.email)}>
                        <ConfirmSubmit
                            message={`Remove ${invitation.email}? They will lose access within 30 seconds.`}
                            className={dangerClass}
                        >
                            Remove
                        </ConfirmSubmit>
                    </form>
                </div>
            )}
        </li>
    )
}

/** The site this page was served from, so a dev preview hands out links to itself. */
async function siteOrigin() {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (!host) return SITE_URL
    return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`
}

function InviteLinkPanel({ links, origin }: { links: ApiResult<InviteLink[]>; origin: string }) {
    if (!links.ok) {
        return links.status === 404 ? null : (
            <Notice tone="error" title="Invite links couldn’t load">The club server didn’t respond. Refresh in a minute.</Notice>
        )
    }
    const active = links.data.filter(l => l.active)
    return (
        <div className="space-y-4 rounded-lg border border-[#77c3ef]/50 bg-[#77c3ef]/5 p-4">
            <div>
                <h3 className="text-lg font-semibold text-[#111111]">Invite link</h3>
                <p className="mt-1 text-sm text-[#555555]">
                    Anyone with the link who signs in with Google joins as a player, no approval needed. Post it in the team
                    group chat. Turn it off any time.
                </p>
            </div>
            {active.map(link => (
                <div key={link.id} className="space-y-2">
                    <CopyLink url={`${origin}/invite/${link.token}`} />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#555555]">
                        <span>
                            {link.uses} joined · works until {formatDate(link.expiresAt)}
                        </span>
                        <form action={revokeInviteLink.bind(null, link.id)}>
                            <ConfirmSubmit
                                message="Turn this link off? People who already joined keep their access."
                                className="text-sm font-semibold text-[#b02a64] underline-offset-4 hover:underline"
                            >
                                Turn off
                            </ConfirmSubmit>
                        </form>
                    </div>
                </div>
            ))}
            <form action={createInviteLink} className="flex flex-wrap items-end gap-2">
                <div>
                    <label htmlFor="invite-link-days" className={labelClass}>{active.length ? 'Make another link' : 'Link works for'}</label>
                    <select id="invite-link-days" name="days" defaultValue="30" className={`${selectClass} mt-1 w-40`}>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                    </select>
                </div>
                <button type="submit" className={`${secondaryCtaClass} py-2.5`}>{active.length ? 'Make new link' : 'Make invite link'}</button>
            </form>
        </div>
    )
}

type Tab = 'matches' | 'people' | 'dues'
const TABS: { id: Tab; label: string }[] = [
    { id: 'matches', label: 'Matches' },
    { id: 'people', label: 'People' },
    { id: 'dues', label: 'Dues' },
]
const PEOPLE_RESULTS = ['approved', 'denied', 'invited', 'removed', 'link_created', 'link_revoked', 'name_saved', 'name_invalid', 'not_pending']
const DUES_RESULTS = ['dues_removed', 'payment_undone', 'payment_undone_card', 'note_saved', 'undo_reason', 'payment_invalid']

/** Which tab to show: ?tab=, else the tab a save just came back from, else Matches. */
function tabFor(params: Record<string, string | string[] | undefined>): Tab {
    if (params.tab === 'matches' || params.tab === 'people' || params.tab === 'dues') return params.tab
    const result = [params.notice, params.error].find((v): v is string => typeof v === 'string')
    if (result && PEOPLE_RESULTS.includes(result)) return 'people'
    if (result && DUES_RESULTS.includes(result)) return 'dues'
    return 'matches'
}

function Tile({ href, label, value, detail, tone }: { href: string; label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: 'alert' }) {
    return (
        <Link href={href} className="block rounded-lg border border-[#EAEAEA] bg-white px-4 py-3 transition-colors hover:border-[#77c3ef]">
            <span className="block text-xs font-semibold uppercase tracking-widest text-[#555555]">{label}</span>
            <span className={cn('mt-1 block truncate text-lg font-semibold', tone === 'alert' ? 'text-[#b02a64]' : 'text-[#111111]')}>{value}</span>
            {detail && <span className="mt-0.5 block truncate text-sm text-[#555555]">{detail}</span>}
        </Link>
    )
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
    if (!memberAuthEnabled()) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Admin" title="Club admin" />
                <ComingSoon />
            </>
        )
    }

    const session = await memberApi()
    if (!session) redirect('/sign-in?callbackUrl=/account/admin')
    const { api } = session

    const me = await api.me()
    if (!me.ok && me.status === 401) redirect('/sign-in?error=expired&callbackUrl=/account/admin')
    const role = me.ok ? me.data.role : session.token.api.user.role
    if (role !== 'admin') {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Admin" title="Club admin" />
                <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
                    <MemberCard className="max-w-xl space-y-4">
                        <Notice tone="error" title="Admins only">This page is for club admins.</Notice>
                        <Link href="/account" className={linkClass}>Back to my account</Link>
                    </MemberCard>
                </div>
            </>
        )
    }

    const params = await searchParams
    const notice = typeof params.notice === 'string' ? notices[params.notice] : undefined
    const error = typeof params.error === 'string' ? errors[params.error] ?? errors.unavailable : undefined
    const selfEmail = (me.ok ? me.data.email : session.token.api.user.email)?.toLowerCase()

    const tab = tabFor(params)
    const [requests, invitations, links, members, dues, nextMatch] = await Promise.all([
        api.joinRequests('pending'), api.invitations(), api.inviteLinks(), api.members(), api.allDues(),
        getMatches().then(all => upcomingMatches(all, todayInOrlando())[0] ?? null).catch(() => null),
    ])
    const nextAvailability = nextMatch ? await api.adminFixtureAvailability(nextMatch._id) : null
    const waiting = requests.ok ? requests.data.length : 0
    const activeLinks = links.ok ? links.data.filter(l => l.active) : []
    const outstanding = dues.ok ? dues.data.reduce((sum, d) => sum + Math.max(0, d.balanceCents), 0) : null
    const missingNames = members.ok ? members.data.filter(m => needsFullName(m.name)).length : 0

    return (
        <>
            <div className="border-b border-[#EAEAEA] bg-white">
                <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-2 px-4 pb-4 pt-8 sm:px-6 lg:px-8">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fd80b5]">Claymores RFC · Admin</p>
                        <h1 className="mt-1 font-claymore text-3xl text-[#111111] sm:text-4xl">Club admin</h1>
                    </div>
                    <Link href="/account" className={`${linkClass} text-sm`}>Back to my account</Link>
                </div>
            </div>

            <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
                {notice && <Notice tone="success" title={notice} />}
                {error && <Notice tone="error" title={error} />}

                <div className={cn('grid grid-cols-2 gap-3', missingNames > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
                    <Tile
                        href="?tab=matches"
                        label={nextMatch ? `Next match · ${shortMatchDate(nextMatch.date)}` : 'Next match'}
                        value={!nextMatch ? 'None scheduled' : `${isHomeMatch(nextMatch) ? 'vs' : 'at'} ${opponentOf(nextMatch)}`}
                        detail={nextAvailability?.ok
                            ? [
                                `${nextAvailability.data.counts.available} can play`,
                                nextAvailability.data.counts.maybe > 0 && `${nextAvailability.data.counts.maybe} maybe`,
                                `${nextAvailability.data.counts.noReply} no reply`,
                            ].filter(Boolean).join(' · ')
                            : undefined}
                    />
                    <Tile href="?tab=people" label="Join requests" value={waiting === 0 ? 'None waiting' : `${waiting} waiting`} tone={waiting > 0 ? 'alert' : undefined} />
                    <Tile href="?tab=dues" label="Dues outstanding" value={outstanding === null ? '—' : formatCents(outstanding)} />
                    {missingNames > 0 && (
                        <Tile href="?tab=people#members" label="Missing last name" value={missingNames} tone="alert" />
                    )}
                </div>

                <nav aria-label="Club admin" className="flex gap-1 border-b border-[#EAEAEA]">
                    {TABS.map(t => (
                        <Link
                            key={t.id}
                            href={`?tab=${t.id}`}
                            aria-current={tab === t.id ? 'page' : undefined}
                            className={cn(
                                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 font-claymore text-lg transition-colors',
                                tab === t.id ? 'border-[#fd80b5] text-[#111111]' : 'border-transparent text-[#555555] hover:text-[#111111]',
                            )}
                        >
                            {t.label}
                            {t.id === 'people' && waiting > 0 && (
                                <span className="rounded-full bg-[#fd80b5] px-2 font-sans text-xs font-semibold text-white">{waiting}</span>
                            )}
                        </Link>
                    ))}
                </nav>

                {tab === 'matches' && (
                    <MatchesSection api={api} alwaysOpen openFixture={typeof params.fixture === 'string' ? params.fixture : undefined} />
                )}

                {tab === 'people' && <>
                <AdminSection
                    id="join-requests"
                    title="Join requests"
                    needsAction={waiting > 0}
                    status={!requests.ok ? 'Couldn’t load' : waiting === 0 ? 'None waiting' : <span className="font-semibold text-[#b02a64]">{waiting} waiting</span>}
                >
                    {!requests.ok ? (
                        <Notice tone="error" title="Join requests couldn't load">
                            {requests.status === 404
                                ? 'Join requests aren’t switched on for the club server yet.'
                                : 'The club server didn’t respond. Refresh in a minute.'}
                        </Notice>
                    ) : requests.data.length === 0 ? (
                        <p className="text-[#555555]">No requests waiting. Nice work.</p>
                    ) : (
                        <ul className="space-y-4">
                            {requests.data.map(r => <JoinRequestRow key={r.id} request={r} />)}
                        </ul>
                    )}
                </AdminSection>

                <AdminSection
                    id="invitations"
                    title="Invite people"
                    status={<>
                        {activeLinks.length > 0 ? 'Invite link on' : 'No invite link'}
                        {invitations.ok && <> · {invitations.data.length} member{invitations.data.length === 1 ? '' : 's'} invited</>}
                    </>}
                >
                    <InviteLinkPanel links={links} origin={await siteOrigin()} />

                    <h3 className="mt-6 text-lg font-semibold text-[#111111]">Invite by email</h3>
                    <p className="mt-1 text-sm text-[#555555]">
                        For one person, or to make someone an admin. Role changes take effect within 30 seconds.
                    </p>

                    <form action={saveInvitation} className="mt-5 grid gap-3 rounded-lg bg-[#fafafa] p-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                        <div>
                            <label htmlFor="invite-email" className={labelClass}>Google email</label>
                            <input id="invite-email" name="email" type="email" required autoComplete="off" className={`${inputClass} mt-1`} placeholder="player@gmail.com" />
                        </div>
                        <div>
                            <label htmlFor="invite-role" className={labelClass}>Role</label>
                            <div className="mt-1"><RoleSelect id="invite-role" /></div>
                        </div>
                        <button type="submit" className={`${ctaClass} py-2 text-base`}>Invite</button>
                    </form>

                    <div className="mt-4">
                        {!invitations.ok ? (
                            <Notice tone="error" title="Invitations couldn't load">
                                {invitations.status === 403
                                    ? 'The club server didn’t accept this admin request from the website yet.'
                                    : 'The club server didn’t respond. Refresh in a minute.'}
                            </Notice>
                        ) : invitations.data.length === 0 ? (
                            <p className="text-[#555555]">No invitations yet.</p>
                        ) : (
                            <ul>
                                {invitations.data.map(inv => (
                                    <InvitationRow key={inv.email} invitation={inv} self={inv.email.toLowerCase() === selfEmail} />
                                ))}
                            </ul>
                        )}
                    </div>
                </AdminSection>

                <MembersSection members={members} />
                </>}

                {tab === 'dues' && <DuesSection api={api} />}
            </div>
        </>
    )
}
