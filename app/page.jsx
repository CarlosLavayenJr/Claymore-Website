import RugbyHero from '@/components/Hero'
import InstagramFeed from "@/components/instafeed";


export default function Home() {
    return (
        <main className="min-h-screen">
            <RugbyHero />
            <InstagramFeed />
        </main>
    );
}