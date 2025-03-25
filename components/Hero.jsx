import Image from "next/image"

export default function RugbyHero() {
    return (
        <section className="relative w-full">
            <div className="relative w-full h-screen">
                <Image
                    src="/homepage/bg1.jpg"
                    alt="Test image"
                    className="w-full h-full object-cover"
                    fill
                />
                <div className="absolute inset-0 w-full h-full bg-black bg-opacity-20 z-10 flex items-center justify-center">
                    <h1 className="text-5xl font-claymore font-semibold -mt-80 text-white text-center">
                        A club built by players, for players
                    </h1>
                </div>
            </div>
        </section>
    )
}