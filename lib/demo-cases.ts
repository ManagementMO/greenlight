// The demo cases in demo-files/ (see demo-files/README.md), as one-click presets on the home screen.
// Every case attaches the Birchfield books; `files` are the extra documents, relative to demo-files/.

export const DEMO_BOOKS = "Birchfield_Custom_Homes_Greenlight_Upload.json";

export interface DemoCase {
  id: string;
  group: "Happy path" | "Tough call" | "Edge case";
  title: string;
  question: string;
  files: string[];
  /** What Headroom should answer, shown under the button. */
  expect: string;
}

const HARBOR = (reserve: string) => `Can we take the Harbor Lane Dental renovation and still keep $${reserve} in the bank?`;

export const DEMO_CASES: DemoCase[] = [
  { id: "hp1", group: "Happy path", title: "Harbor Lane renovation", question: HARBOR("20,000"), files: ["happy-path/1-harbor-lane-renovation.txt"], expect: "Yes · 32/32 cases" },
  { id: "hp1-emails", group: "Happy path", title: "Harbor Lane + emails, $40k reserve", question: HARBOR("40,000"), files: ["happy-path/1-harbor-lane-renovation.txt", "happy-path/3-harbor-lane-email.eml", "happy-path/4-novotny-email.eml"], expect: "Yes · Jev finds the deposit paid and Novotny's promise" },
  { id: "hp1-40k", group: "Happy path", title: "Harbor Lane, $40k reserve, no emails", question: HARBOR("40,000"), files: ["happy-path/1-harbor-lane-renovation.txt"], expect: "Yes, if the timing works out · $13,715 short at worst" },
  { id: "tc1", group: "Tough call", title: "Cedar Court kitchen", question: "Can we take the Cedar Court kitchen remodel and still keep $10,000 in the bank?", files: ["happy-path/5-cedar-court-kitchen.txt"], expect: "Yes, if past-due customers pay · smallest fix: ~$19k more upfront" },
  { id: "tc2", group: "Tough call", title: "Elm Ridge custom home", question: "Can we take the Elm Ridge custom home and still keep $10,000 in the bank?", files: ["happy-path/6-elm-ridge-custom-home.txt"], expect: "Not on these terms · short in every case, no deposit fix" },
  { id: "e2", group: "Edge case", title: "Pay-if-paid clause", question: HARBOR("20,000"), files: ["2-pay-if-paid-contract.txt"], expect: "Not enough yet · Qwen: unsupported" },
  { id: "e4", group: "Edge case", title: "Missing deadline", question: HARBOR("20,000"), files: ["4-missing-deadline-contract.txt"], expect: "Not enough yet · Qwen: ambiguous" },
  { id: "e5", group: "Edge case", title: "Customer pays 45 days late", question: HARBOR("20,000"), files: ["1-clean-contract.txt", "5-customer-email.eml"], expect: "Yes · Jev: 45+ days late" },
];

/** Every file a demo case may fetch; the file route serves only these. */
export const DEMO_FILES = new Set([DEMO_BOOKS, ...DEMO_CASES.flatMap((c) => c.files)]);
