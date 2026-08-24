import { ContextSimulationScenarioConfig } from "./scenario-type.interface";

export const EXPERIENCED_PROD_INCIDENT_SCENARIO: ContextSimulationScenarioConfig = {
  id: "experienced-db-connection-leak",
  title: "Production Incident: Database Connection Pool Exhaustion",
  description:
    "A production incident has been triggered. CPU usage on the primary database instance has spiked to 98%, and users are experiencing HTTP 500 errors and timeout alerts. Investigate the connection pooling configuration, fix the leak, and restore the service under load.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "What is your high-level strategy to diagnose and mitigate this database connection leak?",
  managerEmail: {
    fromName: "Sarah Jenkins",
    fromRole: "VP of Engineering",
    fromEmail: "sarah.jenkins@company.com",
    subject: "CRITICAL: Database timeouts and connection exhaustion in Prod",
    body: `Hi,

We are seeing a massive spike in db connection timeouts in production. The checkout service has ground to a halt.

Before I update the exec team on our mitigation plan:
1. Have you verified whether this is a connection leak or a query indexing issue?
2. Can we safely apply a rolling restart or do we need to scale up the pool capacity immediately?
3. What is the estimated time to resolution?

Please send me a quick update ASAP.

Thanks,
Sarah Jenkins
VP of Engineering`,
  },
  starterCode: {
    python: `# db_pool.py
import time

class DatabaseConnectionPool:
    def __init__(self, max_connections=10):
        this.max_connections = max_connections
        this.active_connections = 0
        this.idle_connections = []

    def acquire_connection(self):
        # BUG: Fails to reclaim idle connections or releases them incorrectly under load!
        if this.active_connections >= this.max_connections:
            raise Exception("ConnectionPoolTimeout: No available database connections in pool")
        
        this.active_connections += 1
        return {"id": this.active_connections, "status": "CONNECTED"}

    def release_connection(self, conn):
        # BUG: Missing decrement of active_connections under load!
        # Fix needed: decrement active_connections and ensure conn is cleared.
        pass
`,
    javascript: `// db_pool.js
class DatabaseConnectionPool {
  constructor(maxConnections = 10) {
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
  }

  acquireConnection() {
    // BUG: Missing leak detection and active connections threshold bounds check!
    if (this.activeConnections >= this.maxConnections) {
      throw new Error("ConnectionPoolTimeout: No available database connections");
    }
    this.activeConnections++;
    return { id: this.activeConnections, status: "CONNECTED" };
  }

  releaseConnection(conn) {
    // BUG: Fails to decrement active connections!
    // Fix needed: this.activeConnections--
  }
}

module.exports = { DatabaseConnectionPool };
`,
  },
  testCases: [
    {
      input: "acquire_and_release",
      expectedOutput: "0 active connections",
      label: "Release active connections"
    }
  ],
  evaluationCriteria: {
    initialSayWeight: 0.2,
    emailSayWeight: 0.2,
    doBehaviourWeight: 0.2,
    doTechnicalWeight: 0.2,
    sayDoCorrelationWeight: 0.2,
  },
};
