import Image from "next/image"

export default function RugbyHero() {
    return (
        <section className="relative w-full">
            <div className="relative w-full h-screen">
                <Image
                    src="/homepage/hdheropic.png"
                    alt="Central Florida Claymores RFC — Orlando Rugby Club, USA Rugby D3"
                    className="w-full h-full object-cover"
                    fill
                />
            </div>
        </section>
    )
}
