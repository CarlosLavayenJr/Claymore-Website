// Maps `DELETE /v1/me` results to what the account page does next. No
// `server-only` import so it can be unit tested.

import type { ApiResult } from './api-client'

/** What the member must type to confirm. */
export const DELETE_CONFIRMATION = 'DELETE'

/** Query flag on `/` after a successful deletion. */
export const ACCOUNT_DELETED_PARAM = 'accountDeleted'

export type DeletionOutcome =
    | { kind: 'deleted' }
    | { kind: 'sign-in' }
    | { kind: 'error'; message: string }

export function isDeleteConfirmed(value: FormDataEntryValue | null): boolean {
    return typeof value === 'string' && value.trim() === DELETE_CONFIRMATION
}

export function deletionOutcome(result: ApiResult<unknown>): DeletionOutcome {
    if (result.ok) return { kind: 'deleted' }
    switch (result.status) {
        case 401:
            return { kind: 'sign-in' }
        case 404:
        case 405:
            // An API without DELETE /v1/me yet. Never claim a deletion that didn't happen.
            return {
                kind: 'error',
                message: 'Self-service deletion isn’t available yet. Email claymoresrfc@gmail.com and we’ll delete your account.',
            }
        case 409:
            if (result.error === 'last_admin') {
                return {
                    kind: 'error',
                    message: 'You’re the club’s only admin. Make another member an admin in Club admin first, then delete your account.',
                }
            }
            return { kind: 'error', message: 'Your account can’t be deleted right now. Contact the club at claymoresrfc@gmail.com.' }
        default:
            return { kind: 'error', message: 'The club server didn’t respond, so nothing was deleted. Try again in a minute.' }
    }
}
