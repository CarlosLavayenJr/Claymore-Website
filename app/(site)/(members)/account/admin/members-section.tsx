import { saveMemberName, saveMemberRole } from './actions'
import { AdminSection } from '@/components/members/admin-section'
import { inputClass, Notice, RoleBadge } from '@/components/members/member-ui'
import type { ApiResult, ClubMember } from '@/lib/claymores/api-client'
import { MAX_NAME_LENGTH, needsFullName, splitName } from '@/lib/claymores/member-name'

const saveClass =
    'inline-flex items-center justify-center rounded-md border border-[#77c3ef] px-3 py-2 text-sm font-semibold text-[#1f6f9c] transition-colors hover:bg-[#77c3ef] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]'

/**
 * Everyone who has signed in, with their name editable and their role. Missing last names are
 * listed first. The super admin can change anyone's role here (except their own).
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
                <>
                    <p className="mb-3 text-sm text-[#555555]">
                        Names come from Google, which sometimes only has a first name. Members are asked for their full
                        name when they sign in; you can fix anyone’s here.
                        {canSetRoles && ' Change roles here too: coaches pick lineups and aren’t asked to play; admins run the club but don’t pick lineups.'}
                    </p>
                    <ul className="divide-y divide-[#EAEAEA]">
                        {list.map(m => {
                            const { first, last } = splitName(m.name)
                            const self = m.email.toLowerCase() === selfEmail
                            const changeable = canSetRoles && !self && m.role !== 'superadmin'
                            return (
                                <li key={m.subject} className="space-y-2 py-3">
                                    <form action={saveMemberName.bind(null, m.subject)}
                                        className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
                                        <span className="min-w-0 break-all text-sm text-[#555555]">
                                            {m.email}
                                            {needsFullName(m.name) && <span className="ml-2 rounded-full bg-[#fd80b5]/15 px-2 py-0.5 text-xs font-semibold text-[#b02a64]">No last name</span>}
                                        </span>
                                        <label className="sr-only" htmlFor={`first-${m.subject}`}>First name for {m.email}</label>
                                        <input id={`first-${m.subject}`} name="first" required maxLength={MAX_NAME_LENGTH}
                                            defaultValue={first} placeholder="First" className={inputClass} />
                                        <label className="sr-only" htmlFor={`last-${m.subject}`}>Last name for {m.email}</label>
                                        <input id={`last-${m.subject}`} name="last" required maxLength={MAX_NAME_LENGTH}
                                            defaultValue={last} placeholder="Last" className={inputClass} />
                                        <button type="submit" className={saveClass}>Save</button>
                                    </form>
                                    {changeable ? (
                                        <form action={saveMemberRole.bind(null, m.email)} className="flex items-center gap-2">
                                            <label htmlFor={`role-${m.subject}`} className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Role</label>
                                            <select id={`role-${m.subject}`} name="role" defaultValue={m.role ?? 'player'} className={`${inputClass} w-36 py-1.5 pr-8 text-sm`}>
                                                <option value="player">Player</option>
                                                <option value="coach">Coach</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                            <button type="submit" className={saveClass}>Save role</button>
                                        </form>
                                    ) : m.role ? (
                                        <RoleBadge role={m.role} />
                                    ) : null}
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </AdminSection>
    )
}
