/**
 * Club roles, as the API reports them.
 * - superadmin: the club owner (set in the API's settings). Everything, and the only one who can
 *   make or change admins and coaches.
 * - coach: club admin access plus picking lineups. Doesn't play: isn't asked for availability and
 *   gets no automatic dues.
 * - admin: club admin access (dues, members, matches). Can see lineups but not pick them.
 * - player: a member.
 */
export type ClubRole = 'superadmin' | 'coach' | 'admin' | 'player'

/** Roles an invitation can hold (the super admin is never an invitation). */
export const invitableRoles = ['player', 'coach', 'admin'] as const
export type InvitableRole = (typeof invitableRoles)[number]

export function isInvitableRole(value: unknown): value is InvitableRole {
    return typeof value === 'string' && (invitableRoles as readonly string[]).includes(value)
}

/** Can open Club Admin. */
export function isClubAdmin(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'coach' || role === 'superadmin'
}

/** Picks lineups. */
export function canPickLineups(role: string | null | undefined): boolean {
    return role === 'coach' || role === 'superadmin'
}

/** Makes, changes and removes admins and coaches. */
export function isSuperAdmin(role: string | null | undefined): boolean {
    return role === 'superadmin'
}

/** Is asked for availability. Everyone but coaches. */
export function plays(role: string | null | undefined): boolean {
    return role !== 'coach'
}

/** An admin or coach invitation: only the super admin may change or remove it. */
export function isStaffRole(role: string | null | undefined): boolean {
    return role === 'admin' || role === 'coach'
}

export function roleLabel(role: string | null | undefined): string {
    switch (role) {
        case 'superadmin': return 'Super admin'
        case 'coach': return 'Coach'
        case 'admin': return 'Admin'
        case 'player': return 'Player'
        default: return role ?? 'Member'
    }
}
