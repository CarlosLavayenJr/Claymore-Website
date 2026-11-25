import { ChevronDown } from 'lucide-react'
import { saveMember } from './actions'
import { AdminSection } from '@/components/members/admin-section'
import { inputClass, labelClass, Notice, RoleBadge } from '@/components/members/member-ui'
import type { ApiResult, ClubMember } from '@/lib/claymores/api-client'
import { MAX_NAME_LENGTH, needsFullName, splitName } from '@/lib/claymores/member-name'

const saveClass =
    'inline-flex h-10 items-center justify-center rounded-md bg-[#77c3ef] px-5 font-claymore text-white transition-colors hover:bg-[#a0d5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]'

const roleHelp: Record<string, string> = {
    player: 'Answers availability and gets club dues.',
    coach: 'Runs the club and picks lineups. Isn’t asked to play.',
    admin: 'Runs the club (dues, members, matches). Doesn’t pick lineups.',
}

/**
 * Everyone who has signed in: name, email and role at a glance; Edit opens one form for their
 * name (and, for the super admin, their role). Missing last names are listed first, already open.
 */
export function MembersSection({ members, canSetRoles = false, selfEmail }: {
    members: ApiResult<ClubMember[]>
    canSetRoles?: boolean
    selfEmail?: string
}) {
    const list = members.ok
        ? [...members.data].sort((a, b) =>
            Number(needsFullName(b.name)) - Number(needsFullName(a.name))
            || (a.name ?? a.email).localeCompare(b.name ?? b.email, 'en', { sensitivity: 'base' }))
        : []
    const missing = list.filter(m => needsFullName(m.name)).length

    return (
        <AdminSection
            id="members"
            title="Members"
            status={!members.ok ? 'Couldn’t load' : <>
                {list.length} signed in
                {missing > 0 && <> · <span className="font-semibold text-[#b02a64]">{missing} missing a last name</span></>}
            </>}
        >
            {!members.ok ? (
                <Notice tone="error" title="Members couldn’t load">The club server didn’t respond. Refresh in a minute.</Notice>
            ) : list.length === 0 ? (
                <p className="text-[#555555]">Nobody has signed in yet.</p>
            ) : (
                <ul className="divide-y divide-[#EAEAEA]">
                    {list.map(m => (
                        <MemberRow key={m.subject} member={m}
                            canSetRole={canSetRoles && m.email.toLowerCase() !== selfEmail && m.role !== 'superadmin'} />
                    ))}
                </ul>
            )}
        </AdminSection>
    )
}

function MemberRow({ member, canSetRole }: { member: ClubMember; canSetRole: boolean }) {
    const { first, last } = splitName(member.name)
    const missing = needsFullName(member.name)
    const role = member.role ?? 'player'
    const id = member.subject.replace(/[^a-zA-Z0-9_-]/g, '_')
    return (
        <li>
            <details className="group/member" open={missing}>
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-[#111111]">{member.name ?? member.email}</span>
                        <span className="block truncate text-sm text-[#555555]">{member.email}</span>
                    </span>
                    {missing && (
                        <span className="shrink-0 rounded-full bg-[#fd80b5]/15 px-2.5 py-0.5 text-xs font-semibold text-[#b02a64]">No last name</span>
                    )}
                    <span className="shrink-0"><RoleBadge role={role} /></span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[#fd80b5]">
                        <span className="group-open/member:hidden">Edit</span>
                        <span className="hidden group-open/member:inline">Close</span>
                        <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open/member:rotate-180" />
                    </span>
                </summary>
                <form action={saveMember.bind(null, { subject: member.subject, email: member.email, name: member.name, role: member.role ?? null })}
                    className="mb-4 grid gap-3 rounded-lg bg-[#fafafa] p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_11rem_auto] lg:items-end">
                    <div>
                        <label htmlFor={`first-${id}`} className={labelClass}>First name</label>
                        <input id={`first-${id}`} name="first" required maxLength={MAX_NAME_LENGTH}
                            defaultValue={first} className={`${inputClass} mt-1`} />
                    </div>
                    <div>
                        <label htmlFor={`last-${id}`} className={labelClass}>Last name</label>
                        <input id={`last-${id}`} name="last" required maxLength={MAX_NAME_LENGTH}
                            defaultValue={last} className={`${inputClass} mt-1`} />
                    </div>
                    {canSetRole && (
                        <div>
                            <label htmlFor={`role-${id}`} className={labelClass}>Role</label>
                            <select id={`role-${id}`} name="role" defaultValue={role} className={`${inputClass} mt-1 pr-8`}>
                                <option value="player">Player</option>
                                <option value="coach">Coach</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    )}
                    <button type="submit" className={saveClass}>Save</button>
                    {canSetRole && (
                        <p className="text-xs text-[#555555] sm:col-span-2 lg:col-span-4">
                            Player: {roleHelp.player} Coach: {roleHelp.coach} Admin: {roleHelp.admin}
                        </p>
                    )}
                </form>
            </details>
        </li>
    )
}
