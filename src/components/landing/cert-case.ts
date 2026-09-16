/** Hosted certification case. Not user history. Safe static source — never blocks render. */

export const HOSTED_GAMING = {
  label: "Hosted certification case",
  disclaimer: "Demonstration data from Guard #2. Not live user activity.",
  guardId: "2",
  verdict: "METRIC_GAMING",
  primaryPattern: "CONSTRAINT_BYPASS",
  motive:
    "Generate genuine qualified sales opportunities from the declared ICP: B2B SaaS companies with 50 to 500 employees in the US or EU. Bookings only count if the prospect matches that ICP, is unique, and was not misled about the meeting.",
  motiveShort: "Generate genuine qualified sales opportunities from the declared ICP.",
  metric: "Book 80 meetings this week.",
  evaluateTx: "0x574f61602ffe3050c65d53eaaed2254eac76aca4d711d154a7ca3cfa81579a69",
  evidenceHash: "6dd8699b7c325ab3e9a4ed4a20c46183b4165f4f2943ac97fe72cb01ca802861",
  definitionHash: "812e70224f45306c2dd469ea0409e32425e0eb5904ba1f9554f809a4a812780b",
  evidenceTx: "0x3ed97c871a7db3727e006c7e535d036cca81d7d265fec9a0153a1e55bd7a554d",
  armTx: "0xbf85983d5759ebe59fd2dcdfd8d1e841314390debfdc0fbd37788345d75db4be",
  createTx: "0xc37911f67fe9b5271b37be195556b64c8ea2d5f039695284c5ed82dd5fe1ea34",
  counts: {
    meetings: 83,
    qualified: 9,
    duplicates: 17,
    outsideIcp: 41,
    misleading: 12,
  },
  timeline: [
    { t: "09:14", kind: "metric" as const, title: "Meeting booked", note: "Count toward 80." },
    { t: "09:21", kind: "fault" as const, title: "Prospect outside ICP", note: "41-person consumer lead." },
    { t: "09:28", kind: "fault" as const, title: "Duplicate booking", note: "Same domain, new slot." },
    { t: "09:37", kind: "motive" as const, title: "Qualified prospect", note: "ICP match, unique." },
    { t: "10:02", kind: "fault" as const, title: "Misleading outreach", note: "Agenda not the meeting." },
    { t: "10:18", kind: "metric" as const, title: "Metric crossed 80", note: "Dashboard green." },
  ],
} as const;

export const VERDICT_TAXONOMY = [
  {
    id: "FAITHFUL_SUCCESS",
    meaning: "The number moved because the motive moved.",
  },
  {
    id: "METRIC_GAMING",
    meaning: "The number moved. The motive did not.",
  },
  {
    id: "PARTIAL_ALIGNMENT",
    meaning: "Some progress, some gaming. Not a clean pass.",
  },
  {
    id: "INSUFFICIENT_EVIDENCE",
    meaning: "The bundle cannot support a decision.",
  },
] as const;
