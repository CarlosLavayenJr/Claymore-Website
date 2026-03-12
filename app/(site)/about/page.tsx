"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"

interface TimelineItem {
    year: string
    title: string
    description: string
}

interface TeamMember {
    name: string
    role: string
    bio: string
    image: string
}

export default function AboutUs() {
    const [activeTimelineItem, setActiveTimelineItem] = useState(0)
    const timelineRef = useRef<HTMLDivElement>(null)

    const timelineItems: TimelineItem[] = [
        {
            year: "2005",
            title: "The Beginning",
            description:
                "Founded by Michael Reynolds with just 15 dedicated players and a vision to create a community-focused sports team.",
        },
        {
            year: "2008",
            title: "First Championship",
            description: "Won our first regional championship, establishing ourselves as serious contenders in the league.",
        },
        {
            year: "2012",
            title: "Training Facility",
            description: "Opened our own dedicated training facility, allowing year-round development for all team members.",
        },
        {
            year: "2015",
            title: "Youth Program",
            description: "Launched our youth development program to nurture the next generation of talented athletes.",
        },
        {
            year: "2018",
            title: "National Recognition",
            description:
                "Received national recognition after winning three consecutive championships and producing several professional athletes.",
        },
        {
            year: "2023",
            title: "Today",
            description:
                "Now with over 200 members across all age groups, we continue to grow while maintaining our commitment to excellence and community.",
        },
    ]

    const teamMembers: TeamMember[] = [
        {
            name: "Adam Chivers",
            role: "Head Coach",
            bio: "Former Claymore player, Adam has transitioned into a Coaching role as of the 2024 season. Nothing defines a club built by players, for players more than one of your own making the transition to full time coach.",
            image: "/determined-coach.png",
        },
        {
            name: "Jamie Moncur",
            role: "Founder & Coach",
            bio: "Jamie Moncur started his rugby journey with 10 years of school boy rugby in Edinburgh, Scotland, followed by a brief coaching stint in The Netherlands. After moving to the USA, he led the University of St. Thomas Celts RFC to significant success, including reaching the Texas State finals in 2009/2010. After a brief hiatus, he returned to coaching with Orlando Rugby in 2016, and in 2018 founded The Claymores, while continuing to develop his coaching expertise through various certifications.\n",
            image: "/assets/coach.jpeg",
        },
        {
            name: "Alexander Cavanaugh",
            role: "President",
            bio: "A former Mizzou standout, Alex has been a cornerstone of the Claymore's success both on and off the field. As captain, he led the team to a D4 state final and numerous victories. Beyond his playing achievements, Alex has been instrumental in building the club's foundation and establishing structures that will benefit the organization long after he hangs up his boots.",
            image: "/assets/alex.jpg",
        },
    ]

    useEffect(() => {
        const handleScroll = () => {
            if (!timelineRef.current) return

            const itemsCount = timelineItems.length
            const timelineRect = timelineRef.current.getBoundingClientRect()
            const timelineStart = timelineRect.top
            const timelineEnd = timelineRect.bottom
            const windowHeight = window.innerHeight

            if (timelineEnd > 0 && timelineStart < windowHeight) {
                const visiblePercentage = Math.min(
                    1,
                    Math.max(0, (windowHeight - timelineStart) / (windowHeight + timelineRect.height)),
                )
                const newActiveItem = Math.min(Math.floor(visiblePercentage * itemsCount), itemsCount - 1)
                setActiveTimelineItem(Math.max(0, newActiveItem))
            }
        }

        window.addEventListener("scroll", handleScroll)
        handleScroll()

        return () => window.removeEventListener("scroll", handleScroll)
    }, [timelineItems.length])

    return (
        <div className="flex flex-col min-h-screen">
            {/* Hero Section */}
            <section className="relative w-full h-[50vh] overflow-hidden">
                <Image src="/homepage/bg1.jpg" alt="Team Banner" fill className="object-cover" priority />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center text-white p-6 max-w-4xl">
                        <h1 className="text-4xl md:text-5xl font-claymore mb-4">A club built by players, for players</h1>
                        <p className="text-xl md:text-2xl">Central Florida Claymores RFC — Orlando, FL — Est. 2018</p>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-4 py-12">
                {/* Team Members */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-10 text-center">Meet Our Club</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {teamMembers.map((member, index) => (
                            <Card key={index}>
                                <CardContent className="pt-6">
                                    <div className="relative w-32 h-32 mx-auto mb-4 rounded-full overflow-hidden">
                                        <Image src={member.image || "/placeholder.svg"} alt={member.name} fill className="object-cover" />
                                    </div>
                                    <h3 className="text-xl font-claymore text-center">{member.name}</h3>
                                    <p className="text-primary font-medium mb-2 text-center">{member.role}</p>
                                    <p className="text-sm text-muted-foreground text-center">{member.bio}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>

                {/* Mission Statement */}
                <section className="mb-16 text-center max-w-3xl mx-auto">
                    <h2 className="text-3xl font-claymore mb-6">Our Start</h2>
                    <p className="text-lg text-muted-foreground">
                        The Central Florida Claymores RFC began life in 2018 as the newest member of the Florida Rugby Union — Orlando&apos;s entry into USA Rugby D3 competition. The task at hand: grow a competitive rugby club built by players, for players, while simultaneously growing the historic sport of rugby across Central Florida.<br /><br />

                        The Claymores began their inaugural season by winning their first match, and the coaches and players have not looked back since. The club reached the D3 state final in 2023, cementing the Claymores as one of Central Florida&apos;s most competitive rugby programs. The team&apos;s expectations are clear — win a state title and advance as far nationally as their spirit and camaraderie will take them.<br /><br />

                        Despite the struggles all have encountered during the COVID pandemic, the Claymores brotherhood has continued to grow in strength and experience at a rate that is electrifying. Every Wednesday, players come together from all over the Orlando area to practice and build the foundation of a long-lasting, winning culture. On Saturdays, the Claymores take the pitch to show that anything is possible with hard work, commitment, and heart.
                    </p>
                </section>

                {/* Timeline Section */}
                <section className="mb-16 py-8">
                    <h2 className="text-3xl font-claymore mb-12 text-center">Our Journey</h2>
                    <div className="relative max-w-4xl mx-auto" ref={timelineRef}>
                        <div className="absolute left-[80px] top-0 bottom-0 w-[2px] bg-primary/20"></div>
                        {timelineItems.map((item, index) => (
                            <div
                                key={index}
                                className={`relative mb-16 transition-all duration-500 ${index <= activeTimelineItem ? "opacity-100" : "opacity-40"
                                    }`}
                            >
                                <div className="flex items-start">
                                    <div className="min-w-[80px] z-10 flex-shrink-0">
                                        <div
                                            className={`inline-block text-xl font-bold py-2 px-3 rounded-lg ${index === activeTimelineItem ? "bg-primary text-white" : "bg-muted"
                                                } transition-colors duration-300`}
                                        >
                                            {item.year}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-center">
                                            <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                                            <p className="text-muted-foreground max-w-xl mx-auto">{item.description}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Call to Action */}
                <section className="py-16 text-center">
                    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
                        <h2 className="text-4xl font-claymore mb-6">Ready To Play?</h2>
                        <p className="text-lg text-muted-foreground mb-8">
                            Join our community of athletes and be part of something special. We welcome players of all skill levels.
                        </p>
                        <Button asChild size="lg" variant="claymore" className="px-8 py-6 text-lg">
                            <Link href="/join">Join the Claymores</Link>
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    )
}
