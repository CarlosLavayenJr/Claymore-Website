import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { approveJoinRequest, denyJoinRequest, removeInvitation, saveInvitation } from './actions'
import { ConfirmSubmit } from '@/components/members/confirm-submit'
import {
    CardHeading,
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
import type { ClubInvitation, JoinRequest } from '@/lib/claymores/api-client'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'
import { memberApi } from '@/lib/claymores/member'

export const metadata: Metadata = {
    title: 'Club admin',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const notices: Record<string, string> = {
    approved: 'Request approved. They can sign in now.',
    denied: 'Request denied.',
    invited: 'Invitation saved.',
    removed: 'Invitation removed.',
}

const errors: Record<string, string> = {
    invalid: 'Check the details and try again.',
    forbidden: 'Only club admins can do that.',
    not_found: 'That item no longer exists. It may have been handled already.',
    conflict: 'That change isn’t allowed. Admins can’t remove or demote themselves.',
    unavailable: 'The club server didn’t respond. Try again in a minute.',
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
            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <form action={approveJoinRequest.bind(null, request.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="sm:w-40">
                        <label htmlFor={`approve-role-${request.id}`} className={labelClass}>Role</label>
                        <div className="mt-1"><RoleSelect id={`approve-role-${request.id}`} /></div>
                    </div>
                    <button type="submit" className={`${ctaClass} py-2 text-base`}>Approve</button>
                </form>
                <form action={denyJoinRequest.bind(null, request.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <label htmlFor={`deny-reason-${request.id}`} className={labelClass}>
                            Reason <span className="font-normal text-[#555555]">(optional)</span>
                        </label>
                        <input id={`deny-reason-${request.id}`} name="reason" maxLength={500} className={`${inputClass} mt-1`} />
                    </div>
                    <ConfirmSubmit message={`Deny the request from ${request.email}?`} className={dangerClass}>Deny</ConfirmSubmit>
                </form>
            </div>
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

    const [requests, invitations] = await Promise.all([api.joinRequests('pending'), api.invitations()])

    return (
        <>
            <MemberHeader eyebrow="Claymores RFC · Admin" title="Club admin">
                Review requests to join and manage who can sign in. <Link href="/account" className={linkClass}>Back to my account</Link>
            </MemberHeader>

            <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
                {notice && <Notice tone="success" title={notice} />}
                {error && <Notice tone="error" title={error} />}

                <MemberCard aria-labelledby="requests-heading">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <CardHeading id="requests-heading">Join requests</CardHeading>
                        {requests.ok && <p className="text-sm text-[#555555]">{requests.data.length} pending</p>}
                    </div>
                    <div className="mt-5">
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
                    </div>
                </MemberCard>

                <MemberCard aria-labelledby="invites-heading">
                    <CardHeading id="invites-heading">Invitations</CardHeading>
                    <p className="mt-2 text-sm text-[#555555]">
                        Invited Google emails can sign in. Role changes take effect within 30 seconds.
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
                </MemberCard>
            </div>
        </>
    )
}
