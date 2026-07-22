import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  infraError?: boolean;
}

@Injectable()
export class SandboxOrchestratorService {
  private readonly logger = new Logger(SandboxOrchestratorService.name);
  private readonly baseWorkspaceDir: string;
  private readonly defaultImage: string;

  constructor(private readonly config: ConfigService) {
    this.baseWorkspaceDir = path.join(process.cwd(), "temp_workspaces");
    this.defaultImage = this.config.get<string>("SIMULATION_DOCKER_IMAGE") || "node:18-alpine";

    if (!fs.existsSync(this.baseWorkspaceDir)) {
      fs.mkdirSync(this.baseWorkspaceDir, { recursive: true });
    }
  }

  /**
   * Provisions or retrieves the persisted workspace volume directory for a session.
   */
  async ensureWorkspace(sessionId: string, starterFiles?: Record<string, string>): Promise<string> {
    const sessionWorkspace = path.join(this.baseWorkspaceDir, sessionId);
    if (!fs.existsSync(sessionWorkspace)) {
      fs.mkdirSync(sessionWorkspace, { recursive: true });

      // Seed starter files if provided (pre-baked offline dependencies)
      if (starterFiles) {
        for (const [filename, content] of Object.entries(starterFiles)) {
          const filePath = path.join(sessionWorkspace, filename);
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, content, "utf-8");
        }
      }
    }
    return sessionWorkspace;
  }

  /**
   * Executes a candidate terminal command inside an isolated container with zero network egress.
   *
   * SECURITY RULE: Never executes candidate inputs directly on the host OS bare child_process.
   * If container runtime fails, returns infraError = true and raises an infra alert.
   */
  async executeCommand(
    sessionId: string,
    command: string,
    imageOverride?: string,
  ): Promise<SandboxExecutionResult> {
    const workspacePath = await this.ensureWorkspace(sessionId);
    const startTime = Date.now();
    const image = imageOverride || this.defaultImage;

    // Docker command with strict security isolation:
    // --network none (zero network egress)
    // --cpus 0.5 (CPU cap)
    // --memory 512m (RAM cap)
    // --rm (cleanup container on exit)
    const dockerArgs = [
      "run",
      "--rm",
      "--network", "none",
      "--cpus", "0.5",
      "--memory", "512m",
      "-v", `${workspacePath}:/workspace`,
      "-w", "/workspace",
      image,
      "sh", "-c", command,
    ];

    try {
      this.logger.log(`Executing container command for session "${sessionId}": ${command}`);
      const { stdout, stderr } = await execFileAsync("docker", dockerArgs, {
        timeout: 15000, // 15s execution timeout
      });

      return {
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;

      // Check if docker executable itself is missing or daemon is unreachable (Infra Failure)
      if (err.code === "ENOENT" || err.message?.includes("connect EACCES") || err.message?.includes("Is the docker daemon running")) {
        this.logger.error(`Sandbox infrastructure failure for session "${sessionId}": ${err.message}`);
        return {
          stdout: "",
          stderr: "Infrastructure Error: The isolated sandbox container environment is temporarily unavailable. This incident has been logged for reviewer review.",
          exitCode: 500,
          durationMs,
          infraError: true,
        };
      }

      // Command timeout inside container
      if (err.killed || err.signal === "SIGTERM") {
        return {
          stdout: err.stdout || "",
          stderr: "Execution timed out (maximum 15 seconds allowed).",
          exitCode: 124,
          durationMs,
        };
      }

      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message || "Command failed",
        exitCode: err.code || 1,
        durationMs,
      };
    }
  }

  /**
   * Reaps the persisted session workspace directory when a session completes or expires.
   */
  async reapWorkspace(sessionId: string): Promise<void> {
    const sessionWorkspace = path.join(this.baseWorkspaceDir, sessionId);
    if (fs.existsSync(sessionWorkspace)) {
      try {
        fs.rmSync(sessionWorkspace, { recursive: true, force: true });
        this.logger.log(`Session workspace reaped for session "${sessionId}".`);
      } catch (err: any) {
        this.logger.warn(`Failed to reap session workspace "${sessionId}": ${err.message}`);
      }
    }
  }
}
