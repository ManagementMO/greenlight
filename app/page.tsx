import { Geist, Lora } from "next/font/google";
import Headroom from "./workspace";
import { getLandingEvidence } from "@/lib/landing-evidence";
import "./demo.css";

const serif = Lora({
  subsets: ["latin"],
  variable: "--font-demo-serif",
  display: "swap",
});
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-demo-sans",
  display: "swap",
});

export default function Page() {
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <Headroom evidence={getLandingEvidence()} />
    </div>
  );
}
