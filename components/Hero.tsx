import Image from "next/image"

export default function RugbyHero() {
    return (
        <section className="relative w-full">
            <div className="relative w-full h-screen">
                <Image
                    src="/homepage/hdheropic.png"
                    alt="Central Florida Claymores RFC — Orlando Rugby Club, USA Rugby D3"
                    className="hidden md:block w-full h-full object-cover"
                    fill
                />
                <Image
                    src="https://cdn.sanity.io/images/bw1seoll/production/2d25cd34de4fe2d52dbb0a05508c2067dbfea8e3-916x1717.png"
                    alt="Central Florida Claymores RFC — Orlando Rugby Club, USA Rugby D3"
                    className="block md:hidden w-full h-full object-cover"
                    fill
                />
            </div>
        </section>
    )
}
