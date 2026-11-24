import Navbar from '@/components/Navbar'
import { memberAuthEnabled } from '@/lib/claymores/auth-env'
import Footer from '@/components/Footer'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar memberAuth={memberAuthEnabled()} />
            <main className="flex-grow">{children}</main>
            <Footer />
        </div>
    )
}
