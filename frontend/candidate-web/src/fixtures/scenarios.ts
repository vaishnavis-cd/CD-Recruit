export type Channel = 'email' | 'slack' | 'ticket'

export interface ScenarioMessage {
  id: number
  atSeconds: number
  channel: Channel
  from: string
  subject?: string
  body: string
  expectsReply: boolean
  triggerCondition?: string // e.g. "afterReplyTo:1"
}

export interface ScenarioScript {
  id: string
  title: string
  messages: ScenarioMessage[]
}

export const SCENARIO_SCRIPTS: Record<string, ScenarioScript> = {
  'api-incident': {
    id: 'api-incident',
    title: 'Production API Incident',
    messages: [
      {
        id: 1,
        atSeconds: 5,
        channel: 'slack',
        from: '#eng-alerts',
        body: '🚨 **ALERT**: Payment API p99 latency spiked to 8.2s (baseline: 180ms). Error rate at 12%. Started approximately 4 minutes ago. Datadog: https://app.datadoghq.fictionalco.com/dash/123',
        expectsReply: false,
      },
      {
        id: 2,
        atSeconds: 20,
        channel: 'slack',
        from: 'priya.sharma',
        body: 'Hey, just saw the alert. I\'m about to join a demo call with a prospective enterprise customer. Do I need to know anything?',
        expectsReply: true,
      },
      {
        id: 3,
        atSeconds: 60,
        channel: 'email',
        from: 'ops-monitoring@fictionalco.com',
        subject: 'Auto-escalation: Payment API SLA breach',
        body: `Hi team,

This is an automated escalation. The Payment API has breached its 99.9% uptime SLA for the current billing period.

Affected endpoints:
- POST /v2/payments/initiate (avg 7.8s, 15% 5xx)
- GET /v2/payments/status (avg 4.1s, 3% 5xx)

Please acknowledge this ticket within 15 minutes to prevent further escalation to VP Engineering.

Incident ID: INC-20240315-0042
Severity: P1`,
        expectsReply: true,
      },
      {
        id: 4,
        atSeconds: 120,
        channel: 'slack',
        from: 'marcus.osei',
        body: 'I pushed a config change to the payment processor connection pool about 30 mins ago — increased max_connections from 20 to 50 to handle more throughput. Could that be related?',
        expectsReply: true,
        triggerCondition: 'afterReplyTo:2',
      },
      {
        id: 5,
        atSeconds: 240,
        channel: 'ticket',
        from: 'Customer Success',
        subject: 'URGENT: Enterprise client FictionalCo Retail reporting payment failures',
        body: `Our largest customer, FictionalCo Retail (ARR $450k), is reporting that checkout payments are failing for their customers. They've been on the phone with their own customers for the last 20 minutes.

Their technical contact is asking:
1. What's the ETA for resolution?
2. Is there a workaround they can implement on their end?
3. Will they receive an incident report?

Can someone respond to them directly?`,
        expectsReply: true,
      },
      {
        id: 6,
        atSeconds: 420,
        channel: 'slack',
        from: '#eng-oncall',
        body: 'Update: I rolled back Marcus\'s config change. p99 is coming down — now at 2.1s. Error rate dropping, currently 2.8%. Looks like the connection pool change caused the upstream payment processor to throttle us.',
        expectsReply: false,
      },
    ],
  },

  'feature-handoff': {
    id: 'feature-handoff',
    title: 'Feature Handoff',
    messages: [
      {
        id: 1,
        atSeconds: 8,
        channel: 'email',
        from: 'elena.vasquez@fictionalco.com',
        subject: 'Handoff: CSV Export feature — please pick this up',
        body: `Hi,

I'm heading out on parental leave starting tomorrow. I wanted to make sure the CSV Export feature (JIRA: PROD-1847) is in good hands.

Current status:
- Backend API endpoint is done and deployed to staging (/api/v1/reports/export)
- Frontend component is about 70% complete — the basic export works but filtering isn't wired up yet
- Design is in Figma (search "CSV Export v2") but there's one open question: should empty cells export as blank or as "N/A"? I never got a final answer from product.
- Tests: backend has unit tests, frontend has none yet

The PM is Maya Chen, she's been pretty responsive. Deadline is end of next sprint (2 weeks).

Branch: feature/csv-export-prod-1847

Let me know if you have any questions before EOD today!

Elena`,
        expectsReply: true,
      },
      {
        id: 2,
        atSeconds: 45,
        channel: 'slack',
        from: 'maya.chen',
        body: 'Hey! Elena mentioned you\'re picking up the CSV export. Super excited about this — sales has been asking for it for months. Quick question: can we also add a "scheduled export" feature where users can set up daily/weekly auto-exports to their email? Seems like it\'d be easy to add while we\'re in there.',
        expectsReply: true,
        triggerCondition: 'afterReplyTo:1',
      },
      {
        id: 3,
        atSeconds: 180,
        channel: 'ticket',
        from: 'QA Team',
        subject: 'Bug: CSV export crashes on reports with >10k rows',
        body: `Found during regression testing on staging.

Steps to reproduce:
1. Generate a report with date range > 90 days (produces ~12,000 rows)
2. Click "Export to CSV"
3. Browser tab becomes unresponsive for ~30 seconds, then crashes

Expected: Download starts promptly or shows progress indicator
Actual: Browser crash

Tested on: Chrome 122, Firefox 123, Safari 17
Note: Works fine for reports with <5,000 rows

Priority: Should block release if not fixed — several power users will immediately export large date ranges.`,
        expectsReply: true,
      },
      {
        id: 4,
        atSeconds: 300,
        channel: 'slack',
        from: 'ravi.patel',
        body: 'Heads up — I just noticed the CSV export endpoint doesn\'t have rate limiting. Someone could hammer it with large export requests and take down the API. Should we add limits before launch?',
        expectsReply: true,
        triggerCondition: 'afterReplyTo:3',
      },
    ],
  },
}
