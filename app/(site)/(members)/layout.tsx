import type { Metadata } from 'next'

// Member pages (sign-in, request to join, account) are never indexed and are
// left out of the sitemap. Public SEO pages stay untouched.
export const metadata: Metadata = {
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function MembersLayout({ children }: { children: React.ReactNode }) {
    return <div className="min-h-[60vh] bg-[#fafafa]">{children}</div>
}
