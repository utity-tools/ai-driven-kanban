import {
  FileTextIcon,
  GitBranchIcon,
  GripVerticalIcon,
  RadioIcon,
  type LucideIcon,
} from "lucide-react";

import { REPO_URL } from "@/lib/brand/site";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/routes";

type NavLink = { label: string; href: string; external?: boolean };

export const HOW_IT_WORKS_ID = "how-it-works";
export const FEATURES_ID = "features";

const README_URL = `${REPO_URL}#readme`;
export const ADR_URL = `${REPO_URL}/tree/main/docs/adr`;

export const HEADER_NAV: NavLink[] = [
  { label: "How it works", href: `#${HOW_IT_WORKS_ID}` },
  { label: "Features", href: `#${FEATURES_ID}` },
  { label: "GitHub", href: REPO_URL, external: true },
];

export const BUILT_WITH: string[] = [
  "Next.js",
  "React",
  "Supabase",
  "Postgres RLS",
  "Vercel AI SDK",
  "Tailwind CSS",
];

/** The product loops in public/landing (see LandingVideo). */
export type LandingVideoName =
  "how-it-works-1-write" | "how-it-works-2-draft" | "how-it-works-3-ack" | "review-spotlight";

export const STEPS: {
  eyebrow: string;
  title: string;
  description: string;
  video: LandingVideoName;
  ai?: boolean;
}[] = [
  {
    eyebrow: "Step 1",
    title: "Write the card",
    description: "Describe the work the way you'd brief a teammate.",
    video: "how-it-works-1-write",
  },
  {
    eyebrow: "Step 2",
    title: "Get a draft",
    description: "Subtasks, estimates and blocked-by links, streamed in seconds.",
    video: "how-it-works-2-draft",
    ai: true,
  },
  {
    eyebrow: "Step 3",
    title: "Ack what's right",
    description: "Accept, edit or discard each item. Only what you ack is saved.",
    video: "how-it-works-3-ack",
  },
];

export const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: GitBranchIcon,
    title: "Dependencies that mean something",
    description: "Blocked-by links, cycle checks and a bottlenecks panel.",
  },
  {
    icon: RadioIcon,
    title: "Built for the whole team",
    description: "Changes and presence sync live for everyone on the board.",
  },
  {
    icon: FileTextIcon,
    title: "Cards with depth",
    description: "Markdown, labels, due dates and members.",
  },
  {
    icon: GripVerticalIcon,
    title: "Move fast",
    description: "Reorder cards and columns with mouse, touch or keyboard.",
  },
];

export const PROBLEM = {
  title: "AI that writes straight to your board is a liability.",
  body: "Auto-generated tasks look productive until someone has to clean them up. ackboard keeps the AI in draft mode. It suggests, you decide, and your board only holds work a person signed off on.",
};

export const REVIEW_SPOTLIGHT: {
  eyebrow: string;
  title: string;
  video: LandingVideoName;
  body: string;
} = {
  eyebrow: "Human in the loop",
  title: "The review is the product.",
  video: "review-spotlight",
  body: "Every proposal arrives as a draft you can edit inline. Change an estimate, rename a subtask or drop a dependency, then ack. ackboard never proposes a link that would create a cycle.",
};

export const HOW_ITS_BUILT = {
  title: "How it's built",
  intro:
    "Designed, built and shipped end to end by one person, in production at kanban.utitytools.com.",
  pillars: [
    {
      title: "Design",
      description:
        'A review-first interface. Orange always means "needs your call", from the logo to the last proposal. The mark is the AI\'s thinking state, frozen.',
    },
    {
      title: "Frontend",
      description:
        "Streaming drafts, keyboard drag and drop, live presence. Accessible, responsive and mobile-first.",
    },
    {
      title: "Engineering",
      description:
        "Every AI response validated against a schema. Row Level Security on every table. Unit and E2E tests on every PR, plus an eval suite for AI quality.",
    },
  ],
  adrLabel: "Read the architecture decisions",
};

export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'What does "ack" mean?',
    answer:
      'Short for acknowledge. Engineers use it to say "seen it, approved". In ackboard, nothing the AI suggests is saved until you ack it.',
  },
  {
    question: "Is my data used to train AI models?",
    answer:
      "No. Your cards' text is sent to the model only when you ask for a draft, and only to providers that don't train on it.",
  },
  {
    question: "Is it free?",
    answer:
      "Yes. ackboard is a portfolio project. AI drafts have a daily limit to keep costs in check.",
  },
  {
    question: "Can I see the code?",
    answer:
      "Yes. The source is on GitHub under the MIT license, with an ADR for every major decision.",
  },
];

export const CREDIT = "utity tools by héctor arrieta";

export const FOOTER_COLUMNS: {
  heading: string;
  links: NavLink[];
  /** Auth pages redirect signed-in visitors, so these links only make sense signed out. */
  signedOutOnly?: boolean;
}[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: `/#${HOW_IT_WORKS_ID}` },
      { label: "Features", href: `/#${FEATURES_ID}` },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "Source on GitHub", href: REPO_URL, external: true },
      { label: "README", href: README_URL, external: true },
      { label: "Architecture decisions", href: ADR_URL, external: true },
    ],
  },
  {
    heading: "Account",
    signedOutOnly: true,
    links: [
      { label: "Sign in", href: LOGIN_PATH },
      { label: "Create account", href: SIGNUP_PATH },
    ],
  },
];
