export interface Candidate {
  id: string;
  name: string;
  email: string;
  initials: string;
}

export interface RoleTemplate {
  id: string;
  roleName: string;
  track: string;
}

export type SessionStatus = "submitted" | "ai_scored" | "review" | "reviewed" | "decision";

export interface Session {
  id: string;
  candidate: Candidate;
  roleTemplate: RoleTemplate;
  status: SessionStatus;
  compositeScore: number;
  sayDoScore: number;
  sayDoTrace: { t: number; said: number; did: number }[];
  moduleScores: Record<string, number>;
  mismatches: { said: string; did: string; impact: string }[];
  integrityFlags: {
    category: string;
    severity: "low" | "critical";
    timestamp: string;
    hasEvidence: boolean;
  }[];
  submittedAt: string;
  reviewer?: { initials: string; name: string };
  decision?: { outcome: "advance" | "reject"; decidedAt: string; decidedBy: string };
}

export interface Invite {
  id: string;
  candidateName: string;
  candidateEmail: string;
  roleTemplate: RoleTemplate;
  status: "PENDING" | "REDEEMED" | "EXPIRED" | "REVOKED";
  link: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  { id: "rt-be-mid", roleName: "Backend Engineer", track: "Mid" },
  { id: "rt-be-sr", roleName: "Backend Engineer", track: "Senior" },
  { id: "rt-fs-mid", roleName: "Full-stack Engineer", track: "Mid" },
  { id: "rt-data-mid", roleName: "Data Engineer", track: "Mid" },
  { id: "rt-ml-sr", roleName: "ML Engineer", track: "Senior" },
];

const MODULES = ["MCQ", "SQL", "Coding / DSA", "AI Prompting", "Contextual Simulation"];

// Deterministic pseudo-random
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function makeTrace(seed: number, divergence: number) {
  const rand = seeded(seed);
  const pts: { t: number; said: number; did: number }[] = [];
  let said = 70 + rand() * 15;
  let did = said - 2;
  for (let i = 0; i <= 40; i++) {
    said += (rand() - 0.5) * 6;
    did += (rand() - 0.5) * 6;
    // Introduce divergence bump around 40-70%
    if (i > 15 && i < 28) did -= divergence * 0.6;
    said = Math.max(30, Math.min(98, said));
    did = Math.max(20, Math.min(98, did));
    pts.push({ t: i, said: Math.round(said), did: Math.round(did) });
  }
  return pts;
}

const NAMES = [
  ["Ava Patel", "ava.patel@example.com", "AP"],
  ["Marcus Chen", "marcus.chen@example.com", "MC"],
  ["Priya Iyer", "priya.iyer@example.com", "PI"],
  ["Diego Alvarez", "diego.alvarez@example.com", "DA"],
  ["Sofia Rossi", "sofia.rossi@example.com", "SR"],
  ["Kenji Watanabe", "kenji.w@example.com", "KW"],
  ["Layla Haddad", "layla.haddad@example.com", "LH"],
  ["Noah Becker", "noah.becker@example.com", "NB"],
  ["Chloé Martin", "chloe.martin@example.com", "CM"],
  ["Ravi Menon", "ravi.menon@example.com", "RM"],
  ["Emma Thompson", "emma.t@example.com", "ET"],
  ["Jonas Weber", "jonas.weber@example.com", "JW"],
  ["Mei Lin", "mei.lin@example.com", "ML"],
  ["Tomás Silva", "tomas.silva@example.com", "TS"],
  ["Hannah Novak", "hannah.novak@example.com", "HN"],
  ["Idris Okafor", "idris.okafor@example.com", "IO"],
];

const STATUSES: SessionStatus[] = [
  "submitted",
  "submitted",
  "ai_scored",
  "ai_scored",
  "review",
  "review",
  "review",
  "reviewed",
  "reviewed",
  "reviewed",
  "decision",
  "decision",
  "ai_scored",
  "review",
  "submitted",
  "reviewed",
];

export const INITIAL_SESSIONS: Session[] = NAMES.map(([name, email, initials], i) => {
  const seed = 100 + i * 37;
  const rand = seeded(seed);
  const composite = Math.round(55 + rand() * 40);
  const divergence = i % 5 === 0 ? 22 : i % 3 === 0 ? 12 : 4;
  const sayDo = Math.max(30, Math.round(92 - divergence * 1.8 - rand() * 8));
  const status = STATUSES[i];

  const flags: Session["integrityFlags"] = [];
  if (i === 2 || i === 9) {
    flags.push({
      category: "Paste-heavy input",
      severity: "critical",
      timestamp: "12:41",
      hasEvidence: true,
    });
    flags.push({
      category: "Tab switching",
      severity: "low",
      timestamp: "18:03",
      hasEvidence: true,
    });
  } else if (i % 4 === 0 && i !== 0) {
    flags.push({
      category: "External lookup",
      severity: "low",
      timestamp: "22:15",
      hasEvidence: false,
    });
  }
  // i === 0 → zero flags (Ava)

  const mismatches =
    divergence > 15
      ? [
          {
            said: "I would add input validation before parsing the payload.",
            did: "Submitted the solution without a validation branch; parsed raw input directly.",
            impact: "Runtime would crash on malformed input — claimed defensiveness not present.",
          },
          {
            said: "Time complexity here is O(n log n) via sorting.",
            did: "Implemented a nested loop over the array — actual complexity is O(n²).",
            impact: "Self-assessed complexity does not match shipped code.",
          },
        ]
      : divergence > 8
        ? [
            {
              said: "I'll refactor the helper before finishing.",
              did: "Left the duplicated helper in place; moved on to next task.",
              impact: "Stated intent not carried through to submitted work.",
            },
          ]
        : [];

  const moduleScores: Record<string, number> = {};
  MODULES.forEach((m, mi) => {
    moduleScores[m] = Math.max(
      30,
      Math.min(98, Math.round(composite + (rand() - 0.5) * 20 - mi * 2)),
    );
  });

  return {
    id: `SES-2607-${String(101 + i).padStart(3, "0")}`,
    candidate: {
      id: `c-${i}`,
      name: name as string,
      email: email as string,
      initials: initials as string,
    },
    roleTemplate: ROLE_TEMPLATES[i % ROLE_TEMPLATES.length],
    status,
    compositeScore: composite,
    sayDoScore: sayDo,
    sayDoTrace: makeTrace(seed, divergence),
    moduleScores,
    mismatches,
    integrityFlags: flags,
    submittedAt: `2026-07-${String(1 + (i % 14)).padStart(2, "0")}`,
    reviewer:
      status === "reviewed" || status === "decision"
        ? { initials: "RB", name: "Rachel Brooks" }
        : undefined,
    decision:
      status === "decision"
        ? {
            outcome: i % 2 === 0 ? "advance" : "reject",
            decidedAt: "2026-07-12",
            decidedBy: "Rachel Brooks",
          }
        : undefined,
  };
});

export const INITIAL_INVITES: Invite[] = [
  {
    id: "INV-001",
    candidateName: "Yusra Kaya",
    candidateEmail: "yusra.kaya@example.com",
    roleTemplate: ROLE_TEMPLATES[0],
    status: "PENDING",
    link: "https://cd-recruit.app/i/8f3aq0",
    createdAt: "2026-07-14",
    expiresAt: "2026-07-16T18:00:00Z",
  },
  {
    id: "INV-002",
    candidateName: "Owen Fitzgerald",
    candidateEmail: "owen.f@example.com",
    roleTemplate: ROLE_TEMPLATES[2],
    status: "REDEEMED",
    link: "https://cd-recruit.app/i/2kd82x",
    createdAt: "2026-07-10",
    expiresAt: "2026-07-12T18:00:00Z",
    redeemedAt: "2026-07-11",
  },
  {
    id: "INV-003",
    candidateName: "Fatima Zahra",
    candidateEmail: "fatima.z@example.com",
    roleTemplate: ROLE_TEMPLATES[1],
    status: "EXPIRED",
    link: "https://cd-recruit.app/i/9m1pze",
    createdAt: "2026-07-01",
    expiresAt: "2026-07-03T18:00:00Z",
  },
  {
    id: "INV-004",
    candidateName: "Andrei Popescu",
    candidateEmail: "andrei.p@example.com",
    roleTemplate: ROLE_TEMPLATES[3],
    status: "REVOKED",
    link: "https://cd-recruit.app/i/pxq02a",
    createdAt: "2026-07-08",
    expiresAt: "2026-07-10T18:00:00Z",
  },
  {
    id: "INV-005",
    candidateName: "Ines Costa",
    candidateEmail: "ines.costa@example.com",
    roleTemplate: ROLE_TEMPLATES[4],
    status: "PENDING",
    link: "https://cd-recruit.app/i/aa71bc",
    createdAt: "2026-07-15",
    expiresAt: "2026-07-17T09:00:00Z",
  },
];

// Dashboard aggregate stats
export function buildDashboardStats(sessions: Session[]) {
  const funnel = [
    { stage: "Invited", count: 148 },
    { stage: "Started", count: 112 },
    { stage: "Completed", count: 87 },
    {
      stage: "Reviewed",
      count: sessions.filter((s) => s.status === "reviewed" || s.status === "decision").length + 42,
    },
    { stage: "Decided", count: sessions.filter((s) => s.status === "decision").length + 24 },
  ];

  const buckets = ["0-40", "40-55", "55-70", "70-85", "85-100"];
  const scoreDistribution = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    return {
      bucket: b,
      count: sessions.filter((s) => s.compositeScore >= lo && s.compositeScore < hi + 0.0001)
        .length,
    };
  });

  // 30 day aggregate say-do
  const sayDoTrace: { date: string; said: number; did: number }[] = [];
  const rand = seeded(42);
  let said = 78;
  let did = 74;
  for (let i = 29; i >= 0; i--) {
    said += (rand() - 0.5) * 4;
    did += (rand() - 0.5) * 4;
    if (i < 18 && i > 10) did -= 2;
    said = Math.max(60, Math.min(92, said));
    did = Math.max(52, Math.min(92, did));
    const d = new Date(2026, 6, 15 - i);
    sayDoTrace.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      said: Math.round(said),
      did: Math.round(did),
    });
  }

  const timeByModule = MODULES.map((m, i) => ({
    module: m,
    avgSeconds: 900 + i * 240 + (i % 2 ? 120 : -80),
    cohortAvgSeconds: 1000 + i * 220,
  }));

  const categories = [
    "Paste-heavy input",
    "Tab switching",
    "External lookup",
    "Multiple identities",
    "Timing anomaly",
  ];
  const severities = ["low", "medium", "critical"];
  const integrityHeatmap: { category: string; severity: string; count: number }[] = [];
  const rr = seeded(7);
  categories.forEach((c) => {
    severities.forEach((s) => {
      const base = s === "critical" ? 1 : s === "medium" ? 4 : 8;
      integrityHeatmap.push({ category: c, severity: s, count: Math.floor(base + rr() * 6) });
    });
  });

  const reviewerAgreement = {
    agreementRate: 0.82,
    overrides: [
      { direction: "lenient" as const, count: 11 },
      { direction: "harsh" as const, count: 7 },
    ],
  };

  return {
    funnel,
    scoreDistribution,
    sayDoTrace,
    timeByModule,
    integrityHeatmap,
    reviewerAgreement,
  };
}

// Tiny sparkline for sidebar (7 days convergence — higher = better)
export const SIDEBAR_SPARK = [78, 82, 79, 84, 81, 86, 88];
