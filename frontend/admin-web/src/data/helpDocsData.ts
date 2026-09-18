export interface CalloutBlock {
  type: 'tip' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
}

export interface StepItem {
  number: number;
  title: string;
  description: string;
  tip?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ScreenshotPlaceholder {
  id: string;
  title: string;
  route: string;
  targetElement: string;
  description: string;
  caption: string;
  calloutBadge?: string;
  imageUrl?: string;
}

export interface GuideSection {
  id: string;
  heading: string;
  summary?: string;
  paragraphs: string[];
  steps?: StepItem[];
  callouts?: CalloutBlock[];
  uiMockupType?: 'drive-builder' | 'roster-table' | 'scorecard' | 'proctoring-clip' | 'composition-summary' | 'question-filter';
  keyTakeaways?: string[];
  screenshotPlaceholder?: ScreenshotPlaceholder;
}

export interface HelpGuide {
  id: string;
  slug: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  readTimeMinutes: number;
  badge: string;
  subtitle: string;
  sections: GuideSection[];
  faqs?: FaqItem[];
  relatedGuideIds?: string[];
}

export interface HelpCategory {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  iconName: string;
  guideCount: number;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    shortLabel: 'Basics',
    description: 'Workspace navigation, dashboard metrics, and staff roles.',
    iconName: 'Compass',
    guideCount: 2,
  },
  {
    id: 'drives',
    title: 'Recruitment Drives',
    shortLabel: 'Drives',
    description: 'Setting up hiring drives, schedules, and duration limits.',
    iconName: 'Target',
    guideCount: 3,
  },
  {
    id: 'invites',
    title: 'Candidate Invites',
    shortLabel: 'Invites',
    description: 'Bulk CSV imports, single-use test links, and live roster tracking.',
    iconName: 'Users',
    guideCount: 3,
  },
  {
    id: 'results',
    title: 'Evaluating Results',
    shortLabel: 'Results',
    description: 'Interpreting scorecards, code inspection, and hiring decisions.',
    iconName: 'BarChart2',
    guideCount: 3,
  },
  {
    id: 'proctoring',
    title: 'Integrity & Proctoring',
    shortLabel: 'Proctoring',
    description: 'Webcam monitoring, 10s evidence video clips, and fair flag reviews.',
    iconName: 'ShieldCheck',
    guideCount: 2,
  },
  {
    id: 'templates-questions',
    title: 'Templates & Questions',
    shortLabel: 'Questions',
    description: 'Pre-built role blueprints, question bank filtering, and custom rubrics.',
    iconName: 'Layers',
    guideCount: 2,
  },
  {
    id: 'settings-reports',
    title: 'Settings & Exports',
    shortLabel: 'Settings',
    description: 'Team member administration, organization profile, and report exports.',
    iconName: 'Settings',
    guideCount: 2,
  },
];

export const HELP_GUIDES: HelpGuide[] = [
  // 1. GETTING STARTED
  {
    id: 'workspace-tour',
    slug: 'workspace-tour',
    title: 'Admin Workspace Tour & Navigation',
    categoryId: 'getting-started',
    categoryLabel: 'Getting Started',
    readTimeMinutes: 3,
    badge: 'Essential',
    subtitle: 'Learn how to navigate the Proctora admin dashboard, monitor live metrics, and manage your hiring pipeline with ease.',
    sections: [
      {
        id: 'dashboard-overview',
        heading: 'Understanding the Executive Dashboard',
        paragraphs: [
          'When you log into Proctora, you land on the central Command Dashboard. This screen provides an instant pulse on your active hiring campaigns, candidate participation rates, and evaluations waiting for your review.',
          'The top row features four high-level KPI cards: Total Candidates, Active Pipeline, Pass Rate, and Critical Risk. Clicking on any card automatically filters your workflow to candidates requiring your immediate attention.',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Action Queue Shortcut',
            message: 'Notice the Action Queue section on the dashboard. It directly surfaces candidates whose assessments were completed in the last 24 hours with high integrity scores so you can fast-track top talent.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-dashboard-overview',
          title: 'Executive Dashboard & Live Pipeline KPIs',
          route: '/dashboard',
          targetElement: 'Top 4 KPI metric cards + Action Queue panel',
          description: 'Capture the full desktop view of the main Command Dashboard showing the 4 KPI cards (Total Candidates, Active Pipeline, Pass Rate, Critical Risk) and the Action Queue cards below.',
          caption: 'The central Command Dashboard provides recruiters with an instant status of all hiring drives and candidates requiring review.',
          calloutBadge: 'Command Dashboard',
          imageUrl: '/help-screenshots/ss-dashboard-overview.png'
        },
      },
      {
        id: 'left-sidebar',
        heading: 'Sidebar Navigation Overview',
        paragraphs: [
          'The clean left sidebar is your main navigation hub, structured logically into standard hiring phases:',
        ],
        steps: [
          {
            number: 1,
            title: 'Drives',
            description: 'Create and configure recruitment campaigns, set schedules, and customize test parameters.',
          },
          {
            number: 2,
            title: 'Invites',
            description: 'Add candidates one-by-one or in bulk via CSV, generate assessment links, and monitor invitation delivery.',
          },
          {
            number: 3,
            title: 'Results',
            description: 'Review candidate scorecards, inspect submitted code and answers, and watch verified proctoring video clips.',
          },
          {
            number: 4,
            title: 'Templates & Question Bank',
            description: 'Explore pre-configured role assessment blueprints or author specialized questions tailored to your tech stack.',
          },
          {
            number: 5,
            title: 'Settings',
            description: 'Manage your recruiting teammates, brand preferences, and global evaluation standards.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do candidates see the admin dashboard?',
        answer: 'Never. Candidates access an isolated, distraction-free assessment environment through their private link and cannot access admin screens.',
      },
      {
        question: 'How often do dashboard statistics refresh?',
        answer: 'Dashboard counts and active candidate numbers update automatically in real-time as candidates begin and finish tests.',
      },
    ],
  },
  {
    id: 'user-roles',
    slug: 'user-roles',
    title: 'User Roles & Permissions Explained',
    categoryId: 'getting-started',
    categoryLabel: 'Getting Started',
    readTimeMinutes: 3,
    badge: 'Governance',
    subtitle: 'Learn the differences between Super Admin, Recruiter, and Reviewer accounts to collaborate securely.',
    sections: [
      {
        id: 'roles-breakdown',
        heading: 'Permission Tiers at a Glance',
        paragraphs: [
          'Proctora provides clear separation of responsibilities so team members can focus on their specific tasks without risking accidental changes to company-wide settings.',
        ],
        callouts: [
          {
            type: 'info',
            title: 'Recruiter vs. Reviewer Separation',
            message: 'Recruiters focus on managing candidate logistics, generating links, and scheduling. Technical Reviewers focus solely on evaluating code submissions and making hire recommendations.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-user-roles',
          title: 'Team Members & Permission Roster',
          route: '/settings',
          targetElement: 'Team Members table & Role badges',
          description: 'Capture the Settings > Team Members tab displaying user rows with role tags (Super Admin, Recruiter, Reviewer) and the "Invite Member" button.',
          caption: 'Role badges clarify staff permissions across drive operations and candidate evaluations.',
          calloutBadge: 'Settings > Team',
        },
        steps: [
          {
            number: 1,
            title: 'Super Admin',
            description: 'Complete workspace access. Can add/remove staff members, configure billing, update company branding, and manage all drives.',
          },
          {
            number: 2,
            title: 'Recruiter (Drive Operations)',
            description: 'Can create drives, upload candidate CSVs, generate links, monitor live test attendance, and view scorecards.',
          },
          {
            number: 3,
            title: 'Reviewer / Interviewer',
            description: 'Focused evaluation view. Can view candidate answers, test cases, playback proctoring evidence clips, and submit Advance/Reject recommendations.',
          },
        ],
      },
    ],
  },

  // 2. RECRUITMENT DRIVES
  {
    id: 'create-drive',
    slug: 'create-drive',
    title: 'Creating & Launching a Hiring Drive',
    categoryId: 'drives',
    categoryLabel: 'Recruitment Drives',
    readTimeMinutes: 4,
    badge: 'Step-by-Step',
    subtitle: 'A complete walk-through to launch a professional hiring assessment in less than 3 minutes.',
    sections: [
      {
        id: 'launch-steps',
        heading: 'How to Launch a New Assessment Drive',
        paragraphs: [
          'A Recruitment Drive groups all your candidates for a specific open job role (for example, "Frontend Engineer Q3 Campus Hiring"). Once created, you can invite candidates and manage everything in one unified dashboard.',
        ],
        uiMockupType: 'drive-builder',
        screenshotPlaceholder: {
          id: 'ss-create-drive-modal',
          title: '3-Step Drive Configuration Wizard',
          route: '/drives',
          targetElement: 'Modal wizard: Step 2 (Assessment Modules & Weightages)',
          description: 'Capture the open "Create Drive" modal at Step 2 showing the module weight sliders (MCQ, SQL, Coding, AI Prompting, Simulation) totaling 100%.',
          caption: 'Configure assessment modules and balance weights to reflect technical role priorities.',
          calloutBadge: 'Drive Wizard',
        },
        steps: [
          {
            number: 1,
            title: 'Click "New Drive"',
            description: 'Navigate to Drives from the sidebar and click the blue "Create Drive" button on the top right.',
          },
          {
            number: 2,
            title: 'Choose a Role Template',
            description: 'Select an existing pre-built role (such as Fullstack Developer, Data Analyst, or QA Specialist) to automatically load vetted questions, time budgets, and difficulty mix.',
            tip: 'You can also pick "Custom Role" if you want to assemble questions from scratch.',
          },
          {
            number: 3,
            title: 'Configure Drive Dates & Schedule',
            description: 'Set when the test opens and closes. Choose between a fixed calendar time or a flexible rolling 24-hour window.',
          },
          {
            number: 4,
            title: 'Review and Confirm',
            description: 'Inspect the Assessment Composition Summary to verify that total time and module weights match your hiring rubric, then click "Launch Drive".',
          },
        ],
        callouts: [
          {
            type: 'success',
            title: 'Zero Question Configuration Needed',
            message: 'When you select a standard Role Template, all module questions, time matrices, and test suites are automatically pre-wired. You do not need to write or pick questions manually unless you wish to.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I change test settings after launching a drive?',
        answer: 'You can edit schedule dates and invite new candidates at any time. However, to preserve fair scoring, question configurations are locked once candidates have begun answering.',
      },
    ],
  },
  {
    id: 'schedule-types',
    slug: 'schedule-types',
    title: 'Schedule Types: Fixed Windows vs. Rolling Windows',
    categoryId: 'drives',
    categoryLabel: 'Recruitment Drives',
    readTimeMinutes: 3,
    badge: 'Configuration',
    subtitle: 'Understand when to enforce a synchronized campus exam window versus allowing candidates to take the test on their own schedule.',
    sections: [
      {
        id: 'schedule-comparison',
        heading: 'Choosing the Right Scheduling Strategy',
        paragraphs: [
          'Proctora provides two scheduling modes depending on your recruiting workflow:',
        ],
        screenshotPlaceholder: {
          id: 'ss-schedule-window',
          title: 'Drive Schedule & Date-Time Window Picker',
          route: '/drives',
          targetElement: 'SingleDateTimePicker start & end calendar picker in Step 1',
          description: 'Capture Step 1 of Create Drive with the Start Date & End Date schedule inputs and time-zone indicator visible.',
          caption: 'Define start and cutoff dates for the drive window. Candidates can only enter within this active range.',
          calloutBadge: 'Schedule Picker',
        },
        steps: [
          {
            number: 1,
            title: 'Fixed Calendar Window (Synchronous Exam)',
            description: 'Ideal for campus drives, hackathons, and batch hiring. All candidates must start between the scheduled start and end time (e.g., Saturday from 10:00 AM to 11:30 AM). Prevents early test leaking.',
          },
          {
            number: 2,
            title: 'Rolling 24h/48h Flexible Window (Asynchronous)',
            description: 'Ideal for experienced lateral hires in different time zones. Candidates can click their invitation link anytime within a 2-day period. Once they start, their personal 90-minute countdown clock begins.',
          },
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Candidate Waiting Room Experience',
            message: 'In fixed window mode, candidates who arrive early are greeted by a relaxing "Take a deep breath" countdown room that automatically launches the test the moment the scheduled time arrives.',
          },
        ],
      },
    ],
  },
  {
    id: 'composition-summary',
    slug: 'composition-summary',
    title: 'Understanding the Assessment Composition Summary',
    categoryId: 'drives',
    categoryLabel: 'Recruitment Drives',
    readTimeMinutes: 4,
    badge: 'Scoring',
    subtitle: 'How module weights, question counts, difficulty distributions, and candidate durations calculate automatically.',
    sections: [
      {
        id: 'composition-table',
        heading: 'Decoding the Assessment Summary Table',
        paragraphs: [
          'Inside every drive configuration, you will find the "Assessment Composition Summary (Time-Aware)" card. This table acts as your contract for the test balance.',
        ],
        uiMockupType: 'composition-summary',
        screenshotPlaceholder: {
          id: 'ss-composition-summary',
          title: 'Assessment Composition Summary Breakdown',
          route: '/drives/$id',
          targetElement: 'Assessment Composition Summary card and Module table',
          description: 'Capture the Assessment Composition Summary table on the Drive Details screen showing module question counts, difficulty distribution (Easy, Medium, Hard), and duration totals.',
          caption: 'The composition table guarantees that the question mix and allotted times match your job requirements perfectly.',
          calloutBadge: 'Drive Summary',
        },
        steps: [
          {
            number: 1,
            title: 'Weight & Marks',
            description: 'Represents how much each section influences the final 100-point score (e.g. Coding: 20%, SQL: 15%, MCQs: 15%). The total always sums to 100%.',
          },
          {
            number: 2,
            title: 'Required Questions',
            description: 'The exact count of questions assigned for each module directly from the role template.',
          },
          {
            number: 3,
            title: 'Difficulty Mix',
            description: 'Shows the exact breakdown of Easy (E), Medium (M), and Hard (H) questions. For example, "8E / 0M / 0H" confirms all 8 questions are at beginner/foundational level.',
          },
          {
            number: 4,
            title: 'Estimated Duration',
            description: 'Calculated using industry-benchmarked completion times so candidates never run out of time unfairly.',
          },
        ],
        callouts: [
          {
            type: 'info',
            title: 'Automatic Time Alignment',
            message: 'The green checkmark banner confirms that the total estimated module times fit comfortably within the 90-minute assessment window.',
          },
        ],
      },
    ],
  },

  // 3. CANDIDATE INVITES
  {
    id: 'csv-bulk-invites',
    slug: 'csv-bulk-invites',
    title: 'Inviting Candidates via CSV Bulk Upload',
    categoryId: 'invites',
    categoryLabel: 'Candidate Invites',
    readTimeMinutes: 3,
    badge: 'Productivity',
    subtitle: 'Upload hundreds of candidates simultaneously using a clean Excel or CSV spreadsheet.',
    sections: [
      {
        id: 'csv-format',
        heading: 'Preparing Your Candidate Spreadsheet',
        paragraphs: [
          'Bulk uploading saves recruiters hours of manual data entry. Proctora accepts any standard `.csv` file containing basic candidate details.',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Minimum Required Columns',
            message: 'Your CSV only needs two mandatory columns: "name" (or "full_name") and "email". Extra columns like "phone" or "college" are safely ignored.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-csv-upload',
          title: 'CSV Candidate Upload & Validation Table',
          route: '/invites',
          targetElement: 'Upload CSV Modal with candidate preview rows',
          description: 'Capture the "Upload Candidates" modal after dropping a CSV file, showing the parsed candidate rows with Name and Email columns.',
          caption: 'Import dozens or hundreds of candidates in a single action using standard CSV format.',
          calloutBadge: 'CSV Import Modal',
        },
        steps: [
          {
            number: 1,
            title: 'Download Sample CSV',
            description: 'Open your Drive, click "Add Candidates", and click "Download Sample CSV" to get a pre-formatted template.',
          },
          {
            number: 2,
            title: 'Drag & Drop Your File',
            description: 'Drop your spreadsheet onto the upload zone. The system instantly previews candidate rows and highlights any invalid emails.',
          },
          {
            number: 3,
            title: 'Confirm Import',
            description: 'Click "Import Candidates". The candidates are added to your Drive Roster in "INVITED" status.',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'What happens if there are duplicate emails?',
        answer: 'Proctora automatically deduplicates rows. If a candidate email is already registered in that drive, it will skip duplicate rows and notify you.',
      },
    ],
  },
  {
    id: 'managing-links',
    slug: 'managing-links',
    title: 'Generating & Sharing Assessment Links',
    categoryId: 'invites',
    categoryLabel: 'Candidate Invites',
    readTimeMinutes: 3,
    badge: 'Security',
    subtitle: 'How single-use secure invite tokens work and how to copy or email test links to applicants.',
    sections: [
      {
        id: 'link-security',
        heading: 'How Proctora Assessment Links Work',
        paragraphs: [
          'Every candidate receives a unique, cryptographically randomized assessment URL (for example: `https://assess.proctora.com/invite/tok_8f9a2b...`).',
          'Because links are tied directly to that candidate’s session, candidates do not need to register, remember passwords, or download external software. They simply click the link in Chrome or Edge.',
        ],
        screenshotPlaceholder: {
          id: 'ss-managing-links',
          title: 'Candidate Roster with One-Click Link Copy',
          route: '/invites',
          targetElement: 'Invites table action column with "Copy Link" and status pills',
          description: 'Capture the Invites table focusing on the "Copy Link" button and the candidate\'s unique single-use access link state.',
          caption: 'Each candidate receives a dedicated, non-transferable assessment link tied to their email.',
          calloutBadge: 'Roster Table',
        },
        steps: [
          {
            number: 1,
            title: 'Click "Generate Links"',
            description: 'In the drive roster, click the blue "Generate Links" button. Links are created instantly for all candidates.',
          },
          {
            number: 2,
            title: 'Copy Single Link or Export All',
            description: 'Click the copy icon next to any candidate to copy their private URL, or click "Export Roster with Links" to download a spreadsheet with all candidate links for mass mailing through your ATS.',
          },
        ],
        callouts: [
          {
            type: 'warning',
            title: 'Single-Use Safeguard',
            message: 'Each link can only be used by one person at a time. If a link is opened simultaneously in two different browsers, Proctora immediately alerts the candidate and freezes the session to prevent proxy test-taking.',
          },
        ],
      },
    ],
  },
  {
    id: 'tracking-roster',
    slug: 'tracking-roster',
    title: 'Tracking the Candidate Live Roster',
    categoryId: 'invites',
    categoryLabel: 'Candidate Invites',
    readTimeMinutes: 3,
    badge: 'Monitoring',
    subtitle: 'Monitor candidate progress in real-time from invite sent to test submission.',
    sections: [
      {
        id: 'roster-statuses',
        heading: 'Candidate Status Life-Cycle',
        paragraphs: [
          'The Candidate Roster tab displays the real-time status of every applicant:',
        ],
        uiMockupType: 'roster-table',
        screenshotPlaceholder: {
          id: 'ss-live-roster',
          title: 'Real-Time Candidate Lifecycle Statuses',
          route: '/invites',
          targetElement: 'Status filter tabs (All, Invited, Started, Completed, Expired)',
          description: 'Capture the candidate roster table with active status badges (e.g. IN_PROGRESS in blue, COMPLETED in green).',
          caption: 'Monitor attendance and submission progress live as candidates complete their assessments.',
          calloutBadge: 'Live Pipeline',
        },
        steps: [
          {
            number: 1,
            title: 'INVITED (Grey)',
            description: 'Assessment link generated. Candidate has not yet clicked the link.',
          },
          {
            number: 2,
            title: 'IN_PROGRESS (Blue)',
            description: 'Candidate is actively sitting for the test. Their timer is running.',
          },
          {
            number: 3,
            title: 'COMPLETED (Green)',
            description: 'Candidate submitted their test. Automated scores and proctoring audit are ready for review.',
          },
          {
            number: 4,
            title: 'FLAGGED (Amber/Red)',
            description: 'Assessment finished, but automated proctoring detected notable anomalies (e.g. multiple tab switches or secondary faces). Reviewer check recommended.',
          },
        ],
      },
    ],
  },

  // 4. EVALUATING RESULTS
  {
    id: 'candidate-scorecards',
    slug: 'candidate-scorecards',
    title: 'Reading Candidate Scorecards & Percentiles',
    categoryId: 'results',
    categoryLabel: 'Evaluating Results',
    readTimeMinutes: 4,
    badge: 'Analytics',
    subtitle: 'How composite scores, percentile ranks, and section benchmarks help you identify top performers.',
    sections: [
      {
        id: 'score-breakdown',
        heading: 'Understanding the Scorecard Hierarchy',
        paragraphs: [
          'Clicking on any candidate row in the Results tab opens their detailed evaluation scorecard.',
        ],
        uiMockupType: 'scorecard',
        screenshotPlaceholder: {
          id: 'ss-candidate-scorecard',
          title: 'Candidate Evaluation Scorecard & Module Breakdown',
          route: '/results/$id',
          targetElement: 'Candidate Scorecard header, composite score badge (e.g. 92/100), and module progress bars',
          description: 'Capture the candidate scorecard detail page showing the overall score percentage, Say-Do consistency score, and individual module breakdown bars.',
          caption: 'Review granular candidate performance across technical modules and integrity signals.',
          calloutBadge: 'Scorecard Detail',
        },
        steps: [
          {
            number: 1,
            title: 'Composite Score (Out of 100)',
            description: 'Weighted combination of all test sections based on the drive’s configured role weights.',
          },
          {
            number: 2,
            title: 'Cohort Percentile Rank',
            description: 'Shows where this candidate ranks compared to all other applicants who completed the same test (e.g., "Top 5% - 95th Percentile").',
          },
          {
            number: 3,
            title: 'Section Breakdown Bar',
            description: 'Visual progress bars showing accuracy in Coding, SQL, MCQs, Debugging, and AI Prompting independently.',
          },
          {
            number: 4,
            title: 'Integrity Rating',
            description: 'A 0–100% Trust Score summarizing biometric verification, camera gaze stability, and tab-focus adherence.',
          },
        ],
      },
    ],
  },
  {
    id: 'inspecting-code',
    slug: 'inspecting-code',
    title: 'Inspecting Code, SQL, and Answers',
    categoryId: 'results',
    categoryLabel: 'Evaluating Results',
    readTimeMinutes: 4,
    badge: 'Deep-Dive',
    subtitle: 'Review candidate code submissions, test cases passed, query plans, and keystroke replay.',
    sections: [
      {
        id: 'code-viewer',
        heading: 'Reviewing Technical Submissions',
        paragraphs: [
          'Reviewers have access to full syntax-highlighted code submissions and automated evaluation logs for every question.',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Hidden vs. Public Test Cases',
            message: 'Proctora evaluates code against both public sample test cases and hidden edge-case inputs (large datasets, boundary conditions, empty inputs) to prevent hardcoded solutions.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-code-viewer',
          title: 'Monaco Code Editor & Test Case Verification Runner',
          route: '/results/$id',
          targetElement: 'Monaco editor with candidate submitted code and test cases passing/failing tabs',
          description: 'Capture the Coding Module review panel displaying the candidate\'s submitted TypeScript/Python code alongside test case execution logs.',
          caption: 'Inspect candidate code indentation, algorithmic efficiency, and passed/failed test case assertions.',
          calloutBadge: 'Code Inspector',
        },
        steps: [
          {
            number: 1,
            title: 'Coding Questions',
            description: 'View the submitted code in Python, Java, C++, or JavaScript. Review compiler output, memory consumption, execution speed, and test case pass rates.',
          },
          {
            number: 2,
            title: 'SQL & Database Queries',
            description: 'Inspect the candidate’s SQL query, execution output table, and query efficiency against PostgreSQL sandboxes.',
          },
          {
            number: 3,
            title: 'AI Prompting Questions',
            description: 'Read the candidate’s engineered prompt alongside automated LLM rubric scoring analyzing specificity, constraints, and clarity.',
          },
        ],
      },
    ],
  },
  {
    id: 'reviewer-decisions',
    slug: 'reviewer-decisions',
    title: 'Making Final Reviewer Decisions (Advance / Reject)',
    categoryId: 'results',
    categoryLabel: 'Evaluating Results',
    readTimeMinutes: 3,
    badge: 'Hiring Action',
    subtitle: 'How to record hiring decisions, leave private notes for your team, and export scorecards.',
    sections: [
      {
        id: 'decision-actions',
        heading: 'Submitting Your Evaluation Call',
        paragraphs: [
          'Once you have examined the candidate’s scores and proctoring audit, you can log an official hiring recommendation directly on their profile.',
        ],
        screenshotPlaceholder: {
          id: 'ss-decision-bar',
          title: 'Decision Action Bar & Recruiter Review Remarks',
          route: '/results/$id',
          targetElement: 'Bottom Decision Bar with "Advance / Pass", "Reject / Fail", and review notes input',
          description: 'Capture the evaluation action bar at the bottom of the candidate result page with decision buttons and remarks field.',
          caption: 'Record formal hiring decisions that sync instantly with your recruitment pipeline and audit trail.',
          calloutBadge: 'Decision Bar',
        },
        steps: [
          {
            number: 1,
            title: 'Advance to Interview (Green)',
            description: 'Marks the candidate as qualified for the next technical round.',
          },
          {
            number: 2,
            title: 'Reject (Red)',
            description: 'Marks the candidate as not meeting the required benchmark.',
          },
          {
            number: 3,
            title: 'Leave Internal Feedback Notes',
            description: 'Write private evaluator notes (e.g. "Candidate wrote clean modular code, recommended for backend team"). Notes are visible only to your internal team.',
          },
        ],
      },
    ],
  },

  // 5. INTEGRITY & PROCTORING
  {
    id: 'proctoring-signals',
    slug: 'proctoring-signals',
    title: 'Understanding Proctoring Flags & Evidence Clips',
    categoryId: 'proctoring',
    categoryLabel: 'Integrity & Proctoring',
    readTimeMinutes: 4,
    badge: 'Security',
    subtitle: 'How Proctora detects anomalies using camera presence, browser shield, and 10-second video evidence clips.',
    sections: [
      {
        id: 'proctoring-mechanics',
        heading: 'Automated Integrity Guardrails',
        paragraphs: [
          'Proctora uses lightweight, privacy-first computer vision and browser monitoring to protect assessment integrity without invading candidate privacy.',
        ],
        uiMockupType: 'proctoring-clip',
        screenshotPlaceholder: {
          id: 'ss-proctoring-player',
          title: '10-Second Event Clip Reviewer with Timeline Markers',
          route: '/results/$id',
          targetElement: 'Proctoring media player with webcam snapshot viewport and flag timeline scrubber',
          description: 'Capture the Proctoring Verification panel showing the candidate\'s periodic webcam feed with timestamped event clips.',
          caption: 'Review periodic 10-second video check-ins to verify candidate identity and absence of unauthorized assistance.',
          calloutBadge: 'Proctoring Player',
        },
        steps: [
          {
            number: 1,
            title: 'Candidate Face Presence',
            description: 'Monitors whether the candidate remains in camera frame. If the candidate steps away, an anomaly timestamp is logged.',
          },
          {
            number: 2,
            title: 'Multiple Faces Detected',
            description: 'Flags if a secondary person enters the webcam field of view.',
          },
          {
            number: 3,
            title: 'Browser Focus & Tab Switching',
            description: 'Detects if the candidate leaves full-screen mode, switches tabs, or minimizes the browser window.',
          },
          {
            number: 4,
            title: '10-Second Evidence Video Clips',
            description: 'Whenever a notable anomaly occurs, a short 10-second rolling video clip is captured and attached to the candidate audit log so human reviewers can verify what happened.',
          },
        ],
        callouts: [
          {
            type: 'info',
            title: 'Human-in-the-Loop Philosophy',
            message: 'Proctora never automatically disqualifies a candidate based solely on AI flags. All flags are presented as timestamps with video evidence for human review.',
          },
        ],
      },
    ],
  },
  {
    id: 'fair-overrides',
    slug: 'fair-overrides',
    title: 'Fair Overrides & Flag Resolution',
    categoryId: 'proctoring',
    categoryLabel: 'Integrity & Proctoring',
    readTimeMinutes: 3,
    badge: 'Best Practice',
    subtitle: 'How to distinguish between accidental distractions and genuine misconduct with empathy and fairness.',
    sections: [
      {
        id: 'resolution-framework',
        heading: 'Evaluating Proctoring Flags Fairly',
        paragraphs: [
          'In remote testing, candidates may experience harmless real-world interruptions. Follow these best practices when reviewing proctoring alerts:',
        ],
        callouts: [
          {
            type: 'tip',
            title: 'Benign False Positives',
            message: 'A brief glance away from the screen, drinking water, or an OS notification banner is completely normal and should be excused.',
          },
          {
            type: 'warning',
            title: 'Genuine Violations',
            message: 'Another person dictating code answers, opening ChatGPT in secondary windows, or leaving the test unattended for prolonged periods.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-flag-resolution',
          title: 'Integrity Flag Review & Dispute Dismissal Panel',
          route: '/results/$id',
          targetElement: 'Flag audit list with "Dismiss (False Positive)" and "Confirm Flag" buttons',
          description: 'Capture the integrity flag list for a candidate showing a flagged event (e.g. "Tab Switch" or "Multiple Faces") with recruiter resolution controls.',
          caption: 'Human recruiters always hold final authority to dismiss false alarms or confirm integrity issues.',
          calloutBadge: 'Flag Review',
        },
        steps: [
          {
            number: 1,
            title: 'Review the Video Evidence Clip',
            description: 'Click on the red flag icon on the candidate timeline to watch the 10-second clip recorded at that exact second.',
          },
          {
            number: 2,
            title: 'Click "Clear Flag" or "Uphold Flag"',
            description: 'If benign, click Clear Flag to restore the candidate’s integrity score. If suspicious, confirm the violation and leave an explanatory note.',
          },
        ],
      },
    ],
  },

  // 6. TEMPLATES & QUESTIONS
  {
    id: 'question-bank-guide',
    slug: 'question-bank-guide',
    title: 'Browsing & Managing the Question Bank',
    categoryId: 'templates-questions',
    categoryLabel: 'Templates & Questions',
    readTimeMinutes: 4,
    badge: 'Content',
    subtitle: 'Filter thousands of multi-skill technical questions or customize problem statements for your company.',
    sections: [
      {
        id: 'filter-search',
        heading: 'Finding the Right Questions Quickly',
        paragraphs: [
          'The Question Bank houses a vast catalog of curated technical questions covering multiple modules and seniority bands.',
        ],
        uiMockupType: 'question-filter',
        screenshotPlaceholder: {
          id: 'ss-question-bank',
          title: 'Question Bank Filtering by Module, Difficulty & Tags',
          route: '/questions',
          targetElement: 'Question Bank filter bar (Difficulty: Easy, Medium, Hard) and question cards',
          description: 'Capture the Question Bank list showing question search, module type filter pills, and question preview cards with difficulty tags.',
          caption: 'Search, filter, or create custom questions with automated evaluation rubrics and test suites.',
          calloutBadge: 'Question Bank',
        },
        steps: [
          {
            number: 1,
            title: 'Filter by Module Type',
            description: 'Isolate questions by MCQ, Coding, SQL, Debugging, AI Prompting, Simulation, or NoSQL.',
          },
          {
            number: 2,
            title: 'Filter by Seniority Level',
            description: 'Select Fresher (foundational concepts), L1 (Junior), L2 (Mid-level), or L3 (Senior/Architect).',
          },
          {
            number: 3,
            title: 'Filter by Department & Tags',
            description: 'Search for specific skills such as "React", "PostgreSQL", "Docker", "Algorithms", or "REST APIs".',
          },
        ],
      },
    ],
  },
  {
    id: 'role-templates',
    slug: 'role-templates',
    title: 'Using Pre-Built Role Templates',
    categoryId: 'templates-questions',
    categoryLabel: 'Templates & Questions',
    readTimeMinutes: 3,
    badge: 'Efficiency',
    subtitle: 'Standardize evaluations across your department using industry-validated role blueprints.',
    sections: [
      {
        id: 'template-benefits',
        heading: 'Why Use Role Templates?',
        paragraphs: [
          'Role Templates encapsulate the ideal skill distribution for standard engineering positions. Each template sets the optimal time balance and question difficulty so every applicant is evaluated on equal footing.',
          'Common pre-configured templates include Frontend Engineer, Backend Developer (Java / Python / Node), Fullstack Engineer, Data Analyst / Engineer, DevOps / SRE, and QA Automation Engineer.',
        ],
        callouts: [
          {
            type: 'success',
            title: 'Ready Out-of-the-Box',
            message: 'Selecting a template automatically populates a balanced 90-minute assessment configuration with zero configuration required.',
          },
        ],
        screenshotPlaceholder: {
          id: 'ss-role-templates',
          title: 'Role Template Catalog & Question Difficulty Breakdown',
          route: '/templates',
          targetElement: 'Template cards grid with module tags and difficulty distribution table',
          description: 'Capture the Templates library page showing pre-built templates (e.g. Senior Frontend Engineer, Data Analyst) with their question mixes.',
          caption: 'Select battle-tested role templates with pre-calibrated question difficulty balances.',
          calloutBadge: 'Templates Catalog',
        },
      },
    ],
  },

  // 7. SETTINGS & EXPORTS
  {
    id: 'team-management',
    slug: 'team-management',
    title: 'Managing Team Members & Roles',
    categoryId: 'settings-reports',
    categoryLabel: 'Settings & Exports',
    readTimeMinutes: 3,
    badge: 'Administration',
    subtitle: 'Invite recruiters and technical interviewers to your organization workspace.',
    sections: [
      {
        id: 'invite-staff',
        heading: 'Adding New Team Members',
        paragraphs: [
          'Admins can grant dashboard access to teammates to assist with candidate screening and code evaluation.',
        ],
        screenshotPlaceholder: {
          id: 'ss-team-management',
          title: 'Invite Team Member Dialog & Role Assignment',
          route: '/settings',
          targetElement: '"Invite Team Member" modal with email and role selection',
          description: 'Capture the modal dialog for inviting a new teammate to Proctora with role options explained.',
          caption: 'Add colleagues to your workspace with role-based access tailored to their hiring responsibilities.',
          calloutBadge: 'Invite Modal',
        },
        steps: [
          {
            number: 1,
            title: 'Go to Settings > Team',
            description: 'Open Settings from the bottom-left profile menu and click the "Team Members" tab.',
          },
          {
            number: 2,
            title: 'Click "Invite Member"',
            description: 'Enter your colleague’s work email and assign their role: Super Admin, Recruiter, or Reviewer.',
          },
          {
            number: 3,
            title: 'Send Invite',
            description: 'Your teammate receives an email notification with login instructions.',
          },
        ],
      },
    ],
  },
  {
    id: 'exporting-reports',
    slug: 'exporting-reports',
    title: 'Exporting Reports & Candidate Data',
    categoryId: 'settings-reports',
    categoryLabel: 'Settings & Exports',
    readTimeMinutes: 3,
    badge: 'Exports',
    subtitle: 'Download complete drive analytics, candidate spreadsheets, and PDF scorecards for your hiring records.',
    sections: [
      {
        id: 'export-options',
        heading: 'Supported Export Formats',
        paragraphs: [
          'Proctora makes it easy to transfer assessment results into your applicant tracking system (ATS) or leadership reporting decks.',
        ],
        screenshotPlaceholder: {
          id: 'ss-export-reports',
          title: '1-Click Export Dropdown & Format Selection',
          route: '/results',
          targetElement: 'Export Dropdown menu showing "Export CSV Roster" and "Executive Summary"',
          description: 'Capture the top action bar on the Results page with the Export Dropdown expanded, showing CSV and summary export choices.',
          caption: 'Download formatted evaluation spreadsheets and executive summaries for ATS integration or hiring debriefs.',
          calloutBadge: 'Export Dropdown',
        },
        steps: [
          {
            number: 1,
            title: 'CSV Candidate Roster Export',
            description: 'Download full spreadsheets containing candidate names, emails, composite scores, module breakdowns, test durations, and proctoring ratings.',
          },
          {
            number: 2,
            title: 'Drive Performance Analytics',
            description: 'Export statistical summaries showing score distribution curves, pass/fail percentages, and average completion times per module.',
          },
        ],
      },
    ],
  },
];
