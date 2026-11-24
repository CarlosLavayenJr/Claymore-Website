import Navbar from '@/components/Navbar'
import { getGoogleSignInUrl } from '@/lib/google-sign-in'
import Footer from '@/components/Footer'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar showSignIn={Boolean(getGoogleSignInUrl())} />
            <main className="flex-grow">{children}</main>
            <Footer />
        </div>
    )
}
