import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import Landing from "./landing/landing";
import "./landing/landing.css";

// The landing page lives at the root; the app (Home → Thinking → Answer) is at /app.
const serif = Lora({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Greenlight — Take the job. Protect payroll.",
};

export default function Page() {
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <Landing />
    </div>
  );
}
