import Link from 'next/link'
import { saveMyName } from './actions'
import { ctaClass, inputClass, labelClass, linkClass, MemberCard, Notice } from '@/components/members/member-ui'
import { MAX_NAME_LENGTH, splitName } from '@/lib/claymores/member-name'

/**
 * Asks for first and last name. Shown at the top of /account when the name Google (or Apple)
 * gave us is missing or a first name only, and when the member chooses to edit it.
 */
export function FullNameCard({ name, editing, error }: { name: string | null; editing: boolean; error: string | null }) {
    const { first, last } = splitName(name)
    return (
        <MemberCard aria-labelledby="full-name-heading" className="border-[#77c3ef]">
            <h2 id="full-name-heading" className="font-claymore text-2xl text-[#111111]">
                {editing ? 'Your name' : 'What’s your full name?'}
            </h2>
            <p className="mt-1 text-sm text-[#555555]">
                {editing
                    ? 'This is how the club sees you: dues, lineups and the app.'
                    : 'Your Google account only gave us part of it. Coaches use it for lineups and dues.'}
            </p>
            {error && <Notice tone="error" title={error} className="mt-4" />}
            <form action={saveMyName} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <div>
                    <label htmlFor="name-first" className={labelClass}>First name</label>
                    <input id="name-first" name="first" required autoComplete="given-name" maxLength={MAX_NAME_LENGTH}
                        defaultValue={first} className={`${inputClass} mt-1`} />
                </div>
                <div>
                    <label htmlFor="name-last" className={labelClass}>Last name</label>
                    <input id="name-last" name="last" required autoComplete="family-name" maxLength={MAX_NAME_LENGTH}
                        defaultValue={last} autoFocus={!last && Boolean(first)} className={`${inputClass} mt-1`} />
                </div>
                <button type="submit" className={`${ctaClass} py-2 text-base`}>Save</button>
            </form>
            {editing && <Link href="/account" className={`${linkClass} mt-3 inline-block text-sm`}>Cancel</Link>}
        </MemberCard>
    )
}
