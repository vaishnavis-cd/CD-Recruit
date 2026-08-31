import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { exec } from "child_process";
import { createServer, Server } from "http";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface AutomationExecutionResult {
  status: ExecutionStatus;
  passedTests: number;
  totalTests: number;
  stdout: string;
  stderr: string;
  compileOutput?: string;
  executionTime: number;
  memoryUsage: number;
}

@Injectable()
export class QaAutomationSandboxService implements OnModuleDestroy {
  private readonly logger = new Logger(QaAutomationSandboxService.name);
  private mockServer?: Server;
  private readonly mockPort = 9099;

  constructor() {
    this.startInternalMockServer();
  }

  private startInternalMockServer() {
    try {
      this.mockServer = createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Mock Target Application</title></head>
          <body>
            <h2>Internal Test Target Form</h2>
            <form id="loginForm">
              <input id="username" type="text" placeholder="Username" />
              <input id="password" type="password" placeholder="Password" />
              <button id="submitBtn" type="button" onclick="document.getElementById('result').innerText='Login Successful'">Submit</button>
              <div id="result"></div>
            </form>
          </body>
          </html>
        `);
      });

      this.mockServer.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          this.logger.log(`Internal Mock Target Page already active on port ${this.mockPort}`);
        } else {
          this.logger.warn(`Mock server error on port ${this.mockPort}: ${err.message}`);
        }
      });

      this.mockServer.listen(this.mockPort, "127.0.0.1", () => {
        this.logger.log(`Internal Mock Target Page listening on http://127.0.0.1:${this.mockPort}`);
      });
    } catch (err: any) {
      this.logger.warn(`Could not start mock server on port ${this.mockPort}: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.mockServer && this.mockServer.listening) {
      await new Promise<void>((resolve) => {
        this.mockServer?.close((err) => {
          if (err) {
            this.logger.warn(`Error closing mock server on port ${this.mockPort}: ${err.message}`);
          } else {
            this.logger.log(`Mock server on port ${this.mockPort} closed.`);
          }
          resolve();
        });
      });
    }
  }

  async runAutomationScript(
    framework: string,
    language: string,
    sourceCode: string,
    timeoutMs: number = 30000,
  ): Promise<AutomationExecutionResult> {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-sandbox-"));

    try {
      const frameworkUpper = (framework || "SELENIUM").toUpperCase();
      const langLower = (language || "python").toLowerCase();

      let command = "";
      let scriptPath = "";

      const pythonExec = os.platform() === "win32" ? "py" : "python3";

      if (frameworkUpper === "SELENIUM" && (langLower === "python" || langLower === "python3")) {
        scriptPath = path.join(tempDir, "script.py");
        const wrappedCode = this.wrapPythonSeleniumCode(sourceCode);
        fs.writeFileSync(scriptPath, wrappedCode, "utf8");
        command = `${pythonExec} "${scriptPath}"`;
      } else if (frameworkUpper === "SELENIUM" && langLower === "java") {
        scriptPath = path.join(tempDir, "Runner.java");
        const wrappedCode = this.wrapJavaSeleniumCode(sourceCode);
        fs.writeFileSync(scriptPath, wrappedCode, "utf8");
        command = `java "${scriptPath}"`;
      } else if (frameworkUpper === "PLAYWRIGHT" || langLower === "javascript" || langLower === "typescript") {
        scriptPath = path.join(tempDir, "script.js");
        const wrappedCode = this.wrapPlaywrightCode(sourceCode);
        fs.writeFileSync(scriptPath, wrappedCode, "utf8");
        command = `node "${scriptPath}"`;
      } else {
        scriptPath = path.join(tempDir, "script.py");
        fs.writeFileSync(scriptPath, this.wrapPythonSeleniumCode(sourceCode), "utf8");
        command = `${pythonExec} "${scriptPath}"`;
      }

      const execResult = await this.executeProcess(command, tempDir, timeoutMs);
      const executionTime = (Date.now() - startTime) / 1000;

      const isPassed =
        execResult.exitCode === 0 &&
        !execResult.stderr.includes("AssertionError") &&
        !execResult.stderr.includes("Error:");
      const totalTests = 1;
      const passedTests = isPassed ? 1 : 0;

      return {
        status: isPassed ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        passedTests,
        totalTests,
        stdout: execResult.stdout || (isPassed ? "Headless automation execution completed successfully." : ""),
        stderr: execResult.stderr,
        executionTime,
        memoryUsage: 45000,
      };
    } catch (err: any) {
      const executionTime = (Date.now() - startTime) / 1000;
      return {
        status: ExecutionStatus.RUNTIME_ERROR,
        passedTests: 0,
        totalTests: 1,
        stdout: "",
        stderr: err.message || "Automation sandbox execution error",
        executionTime,
        memoryUsage: 0,
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  public wrapPythonSeleniumCode(sourceCode: string): string {
    if (sourceCode.includes("webdriver.Chrome") && !sourceCode.includes("headless")) {
      return `
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

options = Options()
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")

${sourceCode}
`;
    }
    return sourceCode;
  }

  public wrapJavaSeleniumCode(sourceCode: string): string {
    return sourceCode;
  }

  public wrapPlaywrightCode(sourceCode: string): string {
    if (sourceCode.includes("chromium.launch(") && !sourceCode.includes("headless")) {
      return sourceCode.replace(/chromium\.launch\(\s*\{?/, "chromium.launch({ headless: true, ");
    }
    return sourceCode;
  }

  private executeProcess(
    command: string,
    cwd: string,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: timeoutMs }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout ? stdout.toString() : "",
          stderr: stderr ? stderr.toString() : error ? error.message : "",
          exitCode: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
        });
      });
    });
  }
}
