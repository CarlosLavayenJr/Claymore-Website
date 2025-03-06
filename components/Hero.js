import Image from "next/image"

export default function RugbyHero() {
    return (
        <section className="relative w-full">
            <div className="relative w-full h-screen">
                <Image
                    src="/homepage/oldclaymores.png"
                    alt="Test image"
                    fill
                />
            </div>
        </section>
    )
}
