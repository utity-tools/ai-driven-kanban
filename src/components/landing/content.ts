import {
  FileTextIcon,
  GitBranchIcon,
  GripVerticalIcon,
  RadioIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";

import { REPO_URL } from "@/lib/brand/site";
import { LOGIN_PATH, SIGNUP_PATH } from "@/lib/auth/routes";

type NavLink = { label: string; href: string; external?: boolean };

export const HOW_IT_WORKS_ID = "how-it-works";
export const FEATURES_ID = "features";

const README_URL = `${REPO_URL}#readme`;
const ADR_URL = `${REPO_URL}/tree/main/docs/adr`;

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

export const STEPS: { eyebrow: string; title: string; description: string; ai?: boolean }[] = [
  {
    eyebrow: "Step 1",
    title: "Describe the work",
    description: "Write a card the way you would for a teammate.",
  },
  {
    eyebrow: "Step 2",
    title: "AI proposes",
    description: "Subtasks with estimates, and the cards that block it.",
    ai: true,
  },
  {
    eyebrow: "Step 3",
    title: "You review",
    description: "Accept, edit or discard each proposal. Nothing is saved until you do.",
  },
  {
    eyebrow: "Step 4",
    title: "Plan with confidence",
    description: "See what is blocked and where the bottlenecks are.",
  },
];

export const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: GripVerticalIcon,
    title: "Drag and drop",
    description: "Reorder cards and columns with mouse, touch or keyboard.",
  },
  {
    icon: FileTextIcon,
    title: "Rich cards",
    description: "Markdown, labels, due dates and members.",
  },
  {
    icon: GitBranchIcon,
    title: "Dependencies",
    description: "Blocked-by links, cycle checks and a bottlenecks panel.",
  },
  {
    icon: RadioIcon,
    title: "Real time",
    description: "Changes and presence sync live across your team.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Private by default",
    description: "Postgres Row Level Security on every board.",
  },
];

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
