/**
 * Helper script to automatically free specified ports before starting dev servers.
 * Usage: node scripts/free-ports.js 5173 3000
 */
const { execSync } = require('child_process');

const targetPorts = process.argv.slice(2).map(Number).filter((p) => !isNaN(p) && p > 0);
const portsToClean = targetPorts.length > 0 ? targetPorts : [5173, 3000, 3001];

const currentPid = process.pid;

for (const port of portsToClean) {
  try {
    if (process.platform === 'win32') {
      let stdout = '';
      try {
        stdout = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      } catch {
        // Port is completely free
        continue;
      }

      const lines = stdout.trim().split('\n');
      const pids = new Set();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        // Only target LISTENING or established connections on exact port
        const localAddress = parts[1] || '';
        const state = parts[3] || '';
        const pid = parts[parts.length - 1];

        if (
          (localAddress.endsWith(`:${port}`) || localAddress.includes(`:${port}`)) &&
          pid &&
          pid !== '0' &&
          Number(pid) !== currentPid &&
          !isNaN(Number(pid))
        ) {
          pids.add(pid);
        }
      }

      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[clean-port] Terminated stale process on port ${port} (PID: ${pid})`);
        } catch {
          // Process already terminated
        }
      }
    } else {
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch {
    // Port is free or cleanup completed
  }
}
