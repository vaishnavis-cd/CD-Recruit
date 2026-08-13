import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { QaAutomationSandboxService } from "../src/execution/qa-automation-sandbox.service";

console.log("=== PHASE 6 QA AUTOMATION SANDBOX VERIFICATION ===");

const sandbox = new QaAutomationSandboxService();

async function run() {
  const seleniumPythonScript = `
import urllib.request

url = "http://127.0.0.1:9099"
print(f"Connecting headlessly to internal mock target: {url}")
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    html = response.read().decode('utf-8')
    print("Internal Target Response Received:")
    print(html[:150])
    assert "Internal Test Target Form" in html, "Target page header missing"
    print("ASSERTION PASSED: Target form located headlessly.")
`;

  console.log("Submitting Selenium Automation script to Sandbox...");
  const result = await sandbox.runAutomationScript("SELENIUM", "python", seleniumPythonScript);

  console.log("\n--- SANDBOX EXECUTION RESULT ---");
  console.log("Status:", result.status);
  console.log(`Passed Tests: ${result.passedTests} / ${result.totalTests}`);
  console.log("Execution Time:", result.executionTime, "s");
  console.log("Memory Usage:", result.memoryUsage, "KB");
  console.log("Stdout:\n" + result.stdout);
  console.log("Stderr:", result.stderr || "(None)");

  if (result.status === "COMPLETED" && result.passedTests === 1) {
    console.log("\nCONFIRMED WORKING: Headless automation execution succeeded against internal isolated target page!");
  } else {
    console.error("\nEXECUTION FAILED");
  }

  process.exit(0);
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
