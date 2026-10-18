import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import Landing from "./landing";
import { getLandingEvidence } from "@/lib/landing-evidence";
import "./landing.css";

const serif = Lora({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Headroom — Take the next job. Keep room for payday.",
  description: "Explore Headroom: source-backed cash decisions, reviewed payment proposals, and a measured AI improvement loop.",
  alternates: { canonical: "/landing" },
};

export default function Page() {
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <Landing evidence={getLandingEvidence()} />
    </div>
  );
}
