import type { Metadata } from 'next'
import Link from 'next/link'
import { signInWithGoogle } from '../actions'
import { JoinForm } from './join-form'
import {
    ComingSoon,
    GoogleButton,
    linkClass,
    MemberCard,
    MemberHeader,
    Notice,
    secondaryCtaClass,
} from '@/components/members/member-ui'
import { ClaymoresApiClient, type JoinRequestStatus } from '@/lib/claymores/api-client'
import { apiBaseUrl, memberAuthEnabled } from '@/lib/claymores/auth-env'
import { getPendingGoogle } from '@/lib/claymores/pending-google'

export const metadata: Metadata = {
    title: 'Request to join',
    description: 'Request a Central Florida Claymores RFC member account.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function Steps({ current }: { current: 1 | 2 | 3 }) {
    const steps = ['Confirm with Google', 'Tell us about you', 'Admin review']
    return (
        <ol className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6" aria-label="Request to join steps">
            {steps.map((label, i) => {
                const n = i + 1
                const state = n < current ? 'done' : n === current ? 'current' : 'todo'
                return (
                    <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                        <span
                            className={
                                state === 'todo'
                                    ? 'flex h-7 w-7 items-center justify-center rounded-full border border-[#EAEAEA] font-claymore text-[#555555]'
                                    : 'flex h-7 w-7 items-center justify-center rounded-full bg-[#77c3ef] font-claymore text-white'
                            }
                        >
                            {n}
                        </span>
                        <span className={state === 'current' ? 'font-semibold text-[#111111]' : 'text-[#555555]'}>{label}</span>
                    </li>
                )
            })}
        </ol>
    )
}

async function currentStatus(idToken: string): Promise<JoinRequestStatus | 'expired' | 'unknown'> {
    const result = await new ClaymoresApiClient({ baseUrl: apiBaseUrl() }).requestStatus(idToken)
    if (result.ok) return result.data.status
    if (result.status === 401) return 'expired'
    return 'unknown'
}

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
    if (!memberAuthEnabled()) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Members" title="Request to join" />
                <ComingSoon />
            </>
        )
    }

    const params = await searchParams
    const fromSignIn = params.from === 'sign-in'
    const pending = await getPendingGoogle()
    const status = pending ? await currentStatus(pending.idToken) : null
    const hasGoogle = Boolean(pending) && status !== 'expired'

    let body: React.ReactNode
    let step: 1 | 2 | 3 = 1
    if (!hasGoogle) {
        body = (
            <div className="space-y-5">
                {status === 'expired' && (
                    <Notice tone="info" title="Confirm your Google account again">
                        The Google step only lasts 10 minutes.
                    </Notice>
                )}
                <p className="text-[#555555]">
                    First, confirm who you are with Google. If the club has already invited that account, you&apos;ll go
                    straight to your account.
                </p>
                <form action={signInWithGoogle}>
                    <input type="hidden" name="callbackUrl" value="/account" />
                    <GoogleButton />
                </form>
            </div>
        )
    } else if (status === 'pending') {
        step = 3
        body = (
            <Notice tone="success" title="Request received — a club admin will review it">
                We&apos;ll be in touch at {pending!.email ?? 'your Google email'}. Once you&apos;re approved,{' '}
                <Link href="/sign-in" className={linkClass}>sign in</Link> with the same Google account.
            </Notice>
        )
    } else if (status === 'approved') {
        step = 3
        body = (
            <div className="space-y-5">
                <Notice tone="success" title="You're in">
                    Your request was approved. Sign in with the same Google account.
                </Notice>
                <Link href="/sign-in" className={secondaryCtaClass}>Sign in</Link>
            </div>
        )
    } else if (status === 'denied') {
        step = 3
        body = (
            <Notice tone="error" title="Your request wasn't approved">
                If you think that&apos;s a mistake, <Link href="/contact" className={linkClass}>contact the club</Link>.
            </Notice>
        )
    } else {
        step = 2
        body = <JoinForm name={pending!.name} email={pending!.email} />
    }

    return (
        <>
            <MemberHeader eyebrow="Claymores RFC · Members" title="Request to join">
                Claymores member accounts are invite-only and are for players, coaches, and volunteers who already train
                with the club in Orlando. Request access and a club admin will review it.
            </MemberHeader>

            <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:px-8">
                <MemberCard aria-labelledby="join-heading">
                    <h2 id="join-heading" className="font-claymore text-2xl text-[#111111]">Your request</h2>
                    <div className="mt-4">
                        <Steps current={step} />
                    </div>
                    {params.invite === 'expired' && (
                        <Notice tone="info" title="That invite link has expired or was turned off" className="mt-5">
                            You can still send a request below and a club admin will review it.
                        </Notice>
                    )}
                    {fromSignIn && hasGoogle && status === 'none' && (
                        <Notice tone="info" title="That Google account isn't on the club list yet" className="mt-5">
                            Send a request below and a club admin will review it.
                        </Notice>
                    )}
                    <div className="mt-6">{body}</div>
                </MemberCard>

                <MemberCard as="div" aria-labelledby="prospect-heading">
                    <h2 id="prospect-heading" className="font-claymore text-2xl text-[#111111]">Haven&apos;t trained with us yet?</h2>
                    <p className="mt-3 text-[#555555]">
                        Come to a practice first — no experience needed. Find out{' '}
                        <Link href="/join" className={linkClass}>how to join Orlando rugby</Link>, or{' '}
                        <Link href="/contact" className={linkClass}>contact the club</Link> and we&apos;ll get you started.
                    </p>
                    <p className="mt-5 text-sm text-[#555555]">
                        Already a member? <Link href="/sign-in" className={linkClass}>Sign in</Link>.
                    </p>
                </MemberCard>
            </div>
        </>
    )
}
