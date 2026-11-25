import Link from 'next/link'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { roleLabel } from '@/lib/claymores/roles'

export const ctaClass =
    'inline-flex items-center justify-center gap-3 rounded-md bg-[#77c3ef] px-6 py-3 font-claymore text-lg text-white transition-colors hover:bg-[#a0d5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-60'

export const secondaryCtaClass =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#77c3ef] px-5 py-2.5 font-claymore text-base text-[#77c3ef] transition-colors hover:bg-[#77c3ef] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111] disabled:cursor-not-allowed disabled:opacity-60'

export const linkClass = 'text-[#fd80b5] underline-offset-4 hover:underline hover:text-[#111111]'

export const inputClass =
    'block w-full rounded-md border border-[#EAEAEA] bg-white px-3 py-2.5 text-base text-[#111111] placeholder:text-[#999999] focus:border-[#77c3ef] focus:outline-none focus:ring-2 focus:ring-[#77c3ef]/40'

export const labelClass = 'block text-sm font-semibold text-[#111111]'

export function MemberHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
    return (
        <header className="border-b border-[#EAEAEA] bg-white">
            <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fd80b5]">{eyebrow}</p>
                <h1 className="mt-3 font-claymore text-4xl text-[#111111] sm:text-5xl">{title}</h1>
                {children && <div className="mt-4 max-w-2xl text-base text-[#555555] sm:text-lg">{children}</div>}
            </div>
        </header>
    )
}

export function MemberCard({ className, children, as: Tag = 'section', ...rest }: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' }) {
    return (
        <Tag className={cn('rounded-lg border border-[#EAEAEA] bg-white p-5 sm:p-6', className)} {...rest}>
            {children}
        </Tag>
    )
}

export function CardHeading({ children, id }: { children: React.ReactNode; id?: string }) {
    return (
        <h2 id={id} className="font-claymore text-2xl text-[#111111]">
            {children}
        </h2>
    )
}

type Tone = 'info' | 'success' | 'error'

const toneStyles: Record<Tone, { box: string; icon: React.ReactNode }> = {
    info: { box: 'border-[#77c3ef] bg-[#77c3ef]/10', icon: <Info aria-hidden className="h-5 w-5 shrink-0 text-[#2b8fc7]" /> },
    success: { box: 'border-[#77c3ef] bg-[#77c3ef]/10', icon: <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-[#2b8fc7]" /> },
    error: { box: 'border-[#fd80b5] bg-[#fd80b5]/10', icon: <AlertCircle aria-hidden className="h-5 w-5 shrink-0 text-[#d63d7e]" /> },
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title: string; children?: React.ReactNode; className?: string }) {
    const style = toneStyles[tone]
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4', style.box, className)}>
            {style.icon}
            <div className="text-sm text-[#111111]">
                <p className="font-semibold">{title}</p>
                {children && <div className="mt-1 text-[#555555]">{children}</div>}
            </div>
        </div>
    )
}

export function RoleBadge({ role }: { role: string | null | undefined }) {
    const admin = role === 'admin' || role === 'coach' || role === 'superadmin'
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-3 py-1 font-claymore text-xs uppercase tracking-wider',
                admin ? 'bg-[#fd80b5] text-white' : 'bg-[#77c3ef]/15 text-[#1f6f9c]',
            )}
        >
            {roleLabel(role)}
        </span>
    )
}

export function ComingSoon() {
    return (
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <MemberCard className="max-w-xl">
                <CardHeading>Sign-in is coming soon</CardHeading>
                <p className="mt-3 text-[#555555]">
                    Member accounts for the Central Florida Claymores are on the way. Until then, reach the club through the{' '}
                    <Link href="/contact" className={linkClass}>contact page</Link> or find out how to{' '}
                    <Link href="/join" className={linkClass}>join Orlando rugby</Link>.
                </p>
            </MemberCard>
        </div>
    )
}

/** Google "G" mark, unmodified colors, per Google's sign-in branding guidelines. */
export function GoogleMark({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 48 48" aria-hidden focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    )
}

/**
 * Brand-blue CTA that keeps Google's G mark on its required white container.
 * Must be rendered inside a <form> whose action starts Google sign-in.
 */
export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
    return (
        <button type="submit" className={cn(ctaClass, 'w-full whitespace-nowrap pl-2 text-base sm:w-auto sm:text-lg')}>
            <span className="flex h-9 w-9 items-center justify-center rounded bg-white">
                <GoogleMark className="h-5 w-5" />
            </span>
            <span>{label}</span>
        </button>
    )
}

export function formatDate(value: string | null | undefined, withTime = false) {
    if (!value) return null
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}),
        timeZone: 'America/New_York',
    }).format(date)
}
