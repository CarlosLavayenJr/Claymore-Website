import type { Metadata } from 'next'
import Link from 'next/link'
import { joinWithInviteLink } from '../../actions'
import { ComingSoon, GoogleButton, linkClass, MemberCard, MemberHeader, Notice } from '@/components/members/member-ui'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'
import { isInviteToken } from '@/lib/claymores/pending-invite'

export const metadata: Metadata = {
    title: 'You’re invited to join the Claymores',
    description: 'Join Central Florida Claymores RFC, Orlando’s rugby club. Sign in with Google to get your member account.',
}

type Params = Promise<{ token: string }>

/**
 * Where an "anyone with the link" invite lands. The button signs in with Google; if that account
 * isn't a member yet, the sign-in step uses the link to add it as a player. Whether the link still
 * works is only checked then, so this page never reveals anything about the token.
 */
export default async function InvitePage({ params }: { params: Params }) {
    const { token } = await params

    if (!memberAuthEnabled()) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Members" title="You’re invited" />
                <ComingSoon />
            </>
        )
    }

    return (
        <>
            <MemberHeader eyebrow="Claymores RFC · Members" title="You’re invited">
                Join the Central Florida Claymores, Orlando’s rugby club. Your member account is where you see and pay
                your dues, on the website and in the Claymores app.
            </MemberHeader>
            <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
                <MemberCard className="max-w-xl space-y-5">
                    <h2 className="font-claymore text-2xl text-[#111111]">Join the club</h2>
                    {isInviteToken(token) ? (
                        <>
                            <p className="text-[#555555]">
                                Sign in with your Google account and you’re in as a player. No request to wait on.
                            </p>
                            <form action={joinWithInviteLink.bind(null, token)}>
                                <GoogleButton label="Join with Google" />
                            </form>
                            <p className="text-sm text-[#555555]">
                                Already a member? This signs you in. Use an Apple ID instead? Open the Claymores app and
                                use “Request to join”.
                            </p>
                        </>
                    ) : (
                        <Notice tone="error" title="This invite link isn’t right">
                            Ask whoever sent it for a fresh link, or <Link href="/sign-up" className={linkClass}>request to join</Link>.
                        </Notice>
                    )}
                </MemberCard>
            </div>
        </>
    )
}
