import type { Metadata } from "next";
import { SchoolWebsite } from "@/components/school-website";
export const metadata: Metadata = { title: "Teamville Montessori School | Ibadan", description: "Meet Teamville Montessori School, Ibadan. Explore our school, discover the learning journey and enter the student and parent portal." };
export default function Home() { return <SchoolWebsite />; }
