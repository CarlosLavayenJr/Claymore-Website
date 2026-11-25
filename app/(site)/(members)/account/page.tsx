import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signOutMember } from '../actions'
import { DeleteAccountForm } from './delete-account-form'
import { PayForm } from './pay-form'
import {
    CardHeading,
    ComingSoon,
    formatDate,
    linkClass,
    MemberCard,
    MemberHeader,
    Notice,
    RoleBadge,
    secondaryCtaClass,
} from '@/components/members/member-ui'
import { creditedCentsOf, paymentMethodLabel } from '@/lib/claymores/admin-dues'
import { formatCents, type DuesAssessment, type DuesDetail } from '@/lib/claymores/api-client'
import { memberAuthEnabled, webCheckoutEnabled } from '@/lib/claymores/auth-env'
import { checkoutReturnStatus } from '@/lib/claymores/checkout'
import { memberApi } from '@/lib/claymores/member'

export const metadata: Metadata = {
    title: 'My account',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function SignOutButton() {
    return (
        <form action={signOutMember}>
            <button type="submit" className={secondaryCtaClass}>Sign out</button>
        </form>
    )
}

function Amount({ label, cents, emphasis }: { label: string; cents: number; emphasis?: boolean }) {
    return (
        <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-[#555555]">{label}</dt>
            <dd className={emphasis ? 'font-claymore text-xl text-[#111111] sm:text-2xl' : 'text-base font-semibold text-[#111111] sm:text-lg'}>
                {formatCents(cents)}
            </dd>
        </div>
    )
}

function DuesItem({ dues, detail }: { dues: DuesAssessment; detail: DuesDetail | null }) {
    const payable = dues.balanceCents - dues.pendingCheckoutCents
    const due = formatDate(dues.dueDate)
    const paidInFull = dues.balanceCents <= 0
    const pending = dues.pendingCheckoutCents > 0
    const credited = creditedCentsOf(dues)
    return (
        <article className="rounded-lg border border-[#EAEAEA] p-4 sm:p-5" aria-labelledby={`dues-${dues.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 id={`dues-${dues.id}`} className="text-lg font-semibold text-[#111111]">{dues.description}</h3>
                    {due && <p className="text-sm text-[#555555]">Due {due}</p>}
                </div>
                <span
                    className={
                        paidInFull
                            ? 'rounded-full bg-[#77c3ef]/15 px-3 py-1 text-xs font-semibold text-[#1f6f9c]'
                            : 'rounded-full bg-[#fd80b5]/15 px-3 py-1 text-xs font-semibold text-[#b02a64]'
                    }
                >
                    {paidInFull ? 'Paid in full' : 'Balance due'}
                </span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <Amount label="Amount" cents={dues.amountCents} />
                <Amount label="Paid" cents={dues.paidCents} />
                <Amount label="Balance" cents={dues.balanceCents} emphasis />
            </dl>
            {credited > 0 && (
                <p className="mt-2 text-sm text-[#555555]">Includes {formatCents(credited)} credited (volunteer/waived)</p>
            )}

            {pending && (
                <Notice tone="info" title={`A payment of ${formatCents(dues.pendingCheckoutCents)} is already in progress`} className="mt-4">
                    Stripe hasn&apos;t confirmed it yet. It usually updates within a few minutes. A new payment can
                    start once this one finishes or expires.
                </Notice>
            )}

            {!paidInFull && webCheckoutEnabled() && (pending || payable >= 50) && (
                <PayForm
                    assessmentId={dues.id}
                    suggestedDollars={(payable / 100).toFixed(2)}
                    pendingDollars={pending ? (dues.pendingCheckoutCents / 100).toFixed(2) : undefined}
                />
            )}

            <details className="mt-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-[#fd80b5] hover:underline">
                    Payment history
                </summary>
                {detail === null ? (
                    <p className="mt-2 text-sm text-[#555555]">Payment history isn&apos;t available right now.</p>
                ) : detail.payments.length === 0 ? (
                    <p className="mt-2 text-sm text-[#555555]">No payments recorded yet.</p>
                ) : (
                    <table className="mt-2 w-full text-sm">
                        <caption className="sr-only">Payments for {dues.description}</caption>
                        <thead>
                            <tr className="border-b border-[#EAEAEA] text-left text-[#555555]">
                                <th scope="col" className="py-2 font-semibold">Recorded</th>
                                <th scope="col" className="hidden py-2 font-semibold sm:table-cell">Method</th>
                                <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {detail.payments.map(p => {
                                const method = paymentMethodLabel(p.method) ?? '—'
                                return (
                                    <tr key={p.id} className="border-b border-[#EAEAEA] last:border-0">
                                        <td className="py-2 pr-2 text-[#111111]">
                                            {formatDate(p.recordedAt, true) ?? '—'}
                                            {/* Narrow screens: method under the date instead of its own column. */}
                                            <span className="block text-xs text-[#555555] sm:hidden">{method}</span>
                                        </td>
                                        <td className="hidden py-2 pr-2 text-[#555555] sm:table-cell">{method}</td>
                                        <td className="py-2 text-right font-semibold text-[#111111]">{formatCents(p.amountCents)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </details>
        </article>
    )
}

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
    if (!memberAuthEnabled()) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Members" title="My account" />
                <ComingSoon />
            </>
        )
    }

    const session = await memberApi()
    if (!session) redirect('/sign-in?callbackUrl=/account')
    const { api, token } = session
    const params = await searchParams
    // Stripe returns here via the API's Stripe:WebReturnUrl: /account?checkout=returned|cancelled
    const checkout = checkoutReturnStatus(params.checkout)

    const [me, dues] = await Promise.all([api.me(), api.myDues()])

    if (!me.ok && me.status === 401) {
        return (
            <>
                <MemberHeader eyebrow="Claymores RFC · Members" title="My account" />
                <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
                    <MemberCard className="max-w-xl space-y-5">
                        <Notice tone="info" title="Your session ended">Sign in again to see your account.</Notice>
                        <SignOutButton />
                    </MemberCard>
                </div>
            </>
        )
    }

    const user = me.ok ? me.data : token.api.user
    const isAdmin = user.role === 'admin'
    const details = dues.ok
        ? await Promise.all(dues.data.map(async d => {
            const r = await api.myDuesDetail(d.id)
            return r.ok ? r.data : null
        }))
        : []
    const totalBalance = dues.ok ? dues.data.reduce((sum, d) => sum + Math.max(0, d.balanceCents), 0) : 0

    return (
        <>
            <MemberHeader eyebrow="Claymores RFC · Members" title={`Welcome${user.name ? `, ${user.name.split(' ')[0]}` : ''}`}>
                Your Claymores dues and payments in one place.
            </MemberHeader>

            <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
                {params.joined === '1' && (
                    <Notice tone="success" title="Welcome to the Claymores">
                        You’re in as a player. Your dues show here once the club assigns them, and you can sign in to the
                        Claymores app with the same Google account.
                    </Notice>
                )}
                {checkout === 'returned' && (
                    <Notice tone="success" title="Thanks — your payment is processing">
                        Your balance updates as soon as Stripe confirms the payment, usually within a few minutes.
                    </Notice>
                )}
                {checkout === 'cancelled' && (
                    <Notice tone="info" title="Checkout cancelled">No payment was taken. You can try again below.</Notice>
                )}
                {!me.ok && (
                    <Notice tone="error" title="Some account details couldn't load">
                        The club server didn&apos;t respond. Showing what we have from your sign-in.
                    </Notice>
                )}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                    <MemberCard aria-labelledby="profile-heading" className="h-fit">
                        <div className="flex items-start justify-between gap-3">
                            <CardHeading id="profile-heading">Profile</CardHeading>
                            <RoleBadge role={user.role} />
                        </div>
                        <dl className="mt-4 space-y-3">
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Name</dt>
                                <dd className="font-semibold text-[#111111]">{user.name ?? '—'}</dd>
                            </div>
                            <div>
                                <dt className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Email</dt>
                                <dd className="break-all font-semibold text-[#111111]">{user.email}</dd>
                            </div>
                        </dl>
                        <div className="mt-6 flex flex-wrap gap-3">
                            {isAdmin && (
                                <Link href="/account/admin" className={secondaryCtaClass}>Club admin</Link>
                            )}
                            <SignOutButton />
                        </div>
                    </MemberCard>

                    <MemberCard aria-labelledby="dues-heading">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <CardHeading id="dues-heading">Dues</CardHeading>
                            {dues.ok && dues.data.length > 0 && (
                                <p className="text-sm text-[#555555]">
                                    Total balance <span className="font-claymore text-xl text-[#111111]">{formatCents(totalBalance)}</span>
                                </p>
                            )}
                        </div>
                        {!webCheckoutEnabled() && dues.ok && totalBalance > 0 && (
                            <p className="mt-3 text-sm text-[#555555]">
                                Online payment on the website is coming soon. Pay in the Claymores app or to the club
                                treasurer at practice.
                            </p>
                        )}
                        <div className="mt-5 space-y-4">
                            {!dues.ok && dues.status === 404 ? (
                                // Dues are switched off in the API: not an error, just not here yet.
                                <Notice tone="info" title="Dues are coming soon">
                                    Online dues aren’t set up for the club yet. Pay the club treasurer at practice for now.
                                </Notice>
                            ) : !dues.ok ? (
                                <Notice tone="error" title="Dues couldn't load">
                                    The club server didn’t respond. Refresh in a minute.
                                </Notice>
                            ) : dues.data.length === 0 ? (
                                <p className="text-[#555555]">
                                    No dues assigned to you. Questions? <Link href="/contact" className={linkClass}>Contact the club</Link>.
                                </p>
                            ) : (
                                dues.data.map((d, i) => <DuesItem key={d.id} dues={d} detail={details[i] ?? null} />)
                            )}
                        </div>
                    </MemberCard>
                </div>

                <MemberCard aria-labelledby="delete-heading">
                    <CardHeading id="delete-heading">Delete my account</CardHeading>
                    <div className="mt-3 max-w-2xl space-y-2 text-sm text-[#555555]">
                        <p>
                            This ends your member access on the website and in the Claymores app, signs you out
                            everywhere, and removes your member record and any request to join. It can&apos;t be undone;
                            to come back, a club admin has to invite you again.
                        </p>
                        <p>
                            Dues and payment records are kept as part of the club&apos;s financial records. See our{' '}
                            <Link href="/privacy" className={linkClass}>privacy policy</Link>.
                        </p>
                    </div>
                    <DeleteAccountForm />
                </MemberCard>
            </div>
        </>
    )
}
