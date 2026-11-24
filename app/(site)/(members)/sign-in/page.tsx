import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signInForDevelopment, signInWithGoogle } from '../actions'
import {
    ComingSoon,
    GoogleButton,
    inputClass,
    labelClass,
    linkClass,
    MemberCard,
    MemberHeader,
    Notice,
    secondaryCtaClass,
} from '@/components/members/member-ui'
import { devSignInEnabled, memberAuthEnabled } from '@/lib/claymores/auth-env'
import { getMemberToken, safeCallbackUrl } from '@/lib/claymores/member'

export const metadata: Metadata = {
    title: 'Member sign-in',
    description: 'Sign in to your Central Florida Claymores RFC member account.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
}

function errorNotice(error: string | undefined) {
    switch (error) {
        case undefined:
            return null
        case 'not_invited':
            return (
                <Notice tone="error" title="That Google account isn't on the club list yet">
                    The Claymores are invite-only for member accounts.{' '}
                    <Link href="/sign-up" className={linkClass}>Request to join</Link> and a club admin will review it.
                </Notice>
            )
        case 'invalid':
            return (
                <Notice tone="error" title="Google couldn't verify that sign-in">
                    Try again, and make sure you pick the Google account the club invited.
                </Notice>
            )
        case 'expired':
            return <Notice tone="info" title="Your session ended">Sign in again to get back to your account.</Notice>
        case 'unavailable':
            return (
                <Notice tone="error" title="The club server didn't respond">
                    Sign-in is temporarily unavailable. Try again in a minute.
                </Notice>
            )
        default:
            return (
                <Notice tone="error" title="Sign-in didn't finish">
                    Something interrupted the Google sign-in. Try again.
                </Notice>
            )
    }
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
    if (!memberAuthEnabled()) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Members" title="Club sign-in" />
                <ComingSoon />
            </>
        )
    }

    const params = await searchParams
    const callbackUrl = safeCallbackUrl(first(params.callbackUrl))
    const error = first(params.error)
    if (!error && (await getMemberToken())) redirect(callbackUrl)

    return (
        <>
            <MemberHeader eyebrow="Claymores RFC · Members" title="Club sign-in">
                Players and club admins sign in with the Google account the Claymores invited. Check your dues, pay
                online, and keep your details up to date.
            </MemberHeader>

            <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:px-8">
                <MemberCard aria-labelledby="sign-in-heading">
                    <h2 id="sign-in-heading" className="font-claymore text-2xl text-[#111111]">Sign in</h2>
                    <div className="mt-4 space-y-4">
                        {first(params.signedOut) && <Notice tone="success" title="You're signed out">See you at practice.</Notice>}
                        {errorNotice(error)}
                    </div>
                    <form action={signInWithGoogle} className="mt-6">
                        <input type="hidden" name="callbackUrl" value={callbackUrl} />
                        <GoogleButton />
                    </form>
                    <p className="mt-4 text-sm text-[#555555]">
                        We only use your Google name and email to match your club invitation.
                        See our <Link href="/privacy" className={linkClass}>privacy policy</Link>.
                    </p>

                    {devSignInEnabled() && (
                        <form action={signInForDevelopment} className="mt-8 rounded-md border border-dashed border-[#fd80b5] p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-[#fd80b5]">Development only</p>
                            <input type="hidden" name="callbackUrl" value={callbackUrl} />
                            <label htmlFor="dev-email" className={`${labelClass} mt-2`}>Mock API email</label>
                            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                                <input id="dev-email" name="email" type="email" required className={inputClass} placeholder="player@example.com" />
                                <button type="submit" className={secondaryCtaClass}>Sign in</button>
                            </div>
                        </form>
                    )}
                </MemberCard>

                <MemberCard as="div" aria-labelledby="new-heading">
                    <h2 id="new-heading" className="font-claymore text-2xl text-[#111111]">New to the club?</h2>
                    <p className="mt-3 text-[#555555]">
                        Member accounts are invite-only. If you already train with the Claymores, request to join and a
                        club admin will approve you.
                    </p>
                    <Link href="/sign-up" className={`${secondaryCtaClass} mt-5`}>Request to join</Link>
                    <p className="mt-5 text-sm text-[#555555]">
                        Never played? Start with{' '}
                        <Link href="/join" className={linkClass}>how to join Orlando rugby</Link>.
                    </p>
                </MemberCard>
            </div>
        </>
    )
}
