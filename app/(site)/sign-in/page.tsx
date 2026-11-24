import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGoogleSignInUrl } from '@/lib/google-sign-in'

export const metadata: Metadata = {
    title: 'Club sign-in',
    robots: { index: false, follow: false },
}

export default function SignInPage() {
    const url = getGoogleSignInUrl()
    if (!url) notFound()

    return (
        <section className="mx-auto max-w-md px-6 py-20">
            <h1 className="font-claymore text-4xl">Club sign-in</h1>
            <p className="mt-4 text-gray-700">
                Use the Google account invited by the club.
            </p>
            <a
                href={url}
                className="mt-6 inline-block rounded-md border border-gray-400 px-5 py-3 font-semibold text-[#111111] hover:bg-[#77c3ef]/20 focus-visible:outline focus-visible:outline-2"
            >
                Continue with Google
            </a>
        </section>
    )
}
