import type { Metadata } from "next";
import { Geist, Lora } from "next/font/google";
import Landing from "./landing";
import { getLandingEvidence } from "@/lib/landing-evidence";
import { getLandingCashStory } from "@/lib/landing-cash-story";
import "./landing.css";
import "./cash-story.css";

const serif = Lora({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Headroom — Take the next job. Keep room for payday.",
  description: "A big job can leave a small business short of cash. Headroom checks when money arrives and bills are due, then tests a better payment schedule.",
  alternates: { canonical: "/landing" },
};

export default function Page() {
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <Landing evidence={getLandingEvidence()} cashStory={getLandingCashStory()} />
    </div>
  );
}
