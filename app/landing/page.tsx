import { permanentRedirect } from "next/navigation";

// The landing page moved to the root. Old /landing links still work.
export default function LandingRedirect() {
  permanentRedirect("/");
}
