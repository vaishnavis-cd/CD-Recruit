import { QaAutomationSandboxService } from "./qa-automation-sandbox.service";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import assert from "node:assert";

async function runQaAutomationSandboxTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for QA Automation Sandbox Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const sandboxService = new QaAutomationSandboxService();

  // ---------------------------------------------------------------------------
  // TEST 1: Python Selenium Headless Flag Wrapping
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing Python Selenium code wrapping with headless Chrome flags...");

    const userScript = `
driver = webdriver.Chrome()
driver.get("http://127.0.0.1:9099")
driver.find_element(By.ID, "username").send_keys("testuser")
`;
    const wrapped = sandboxService.wrapPythonSeleniumCode(userScript);
    assert(wrapped.includes("--headless=new"), "Wrapped script must include '--headless=new'");
    assert(wrapped.includes("--no-sandbox"), "Wrapped script must include '--no-sandbox'");
    assert(wrapped.includes("--disable-gpu"), "Wrapped script must include '--disable-gpu'");
    pass("wrapPythonSeleniumCode injects headless Chromium launch arguments");

    // Pre-configured headless script should not be doubly wrapped
    const alreadyHeadless = `
options = Options()
options.add_argument("--headless=new")
driver = webdriver.Chrome(options=options)
`;
    const wrappedAlready = sandboxService.wrapPythonSeleniumCode(alreadyHeadless);
    assert.strictEqual(wrappedAlready, alreadyHeadless, "Already headless code should not be re-wrapped");
    pass("wrapPythonSeleniumCode preserves scripts that already configure headless flags");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Playwright Headless Code Wrapping
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing Playwright code wrapping with headless options...");

    const userPlaywright = `
const browser = await chromium.launch();
const page = await browser.newPage();
`;
    const wrappedPlaywright = sandboxService.wrapPlaywrightCode(userPlaywright);
    assert(wrappedPlaywright.includes("headless: true"), "Playwright launch must inject headless: true");
    pass("wrapPlaywrightCode injects headless: true into Chromium launch");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Script Execution Handling & Error Trapping
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing execution runtime and error trapping on invalid script...");

    // Test with a non-existent syntax/command
    const result = await sandboxService.runAutomationScript(
      "PLAYWRIGHT",
      "javascript",
      "process.exit(1);",
      5000,
    );

    assert(
      result.status === ExecutionStatus.FAILED || result.status === ExecutionStatus.RUNTIME_ERROR,
      "Failing script must return FAILED or RUNTIME_ERROR status",
    );
    assert(result.passedTests === 0, "Failing script must have 0 passed tests");
    assert(typeof result.executionTime === "number", "Execution time must be reported as a number");
    pass("runAutomationScript handles non-zero exit codes with clean execution failure status");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: OnModuleDestroy Server Teardown
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing OnModuleDestroy server lifecycle teardown...");

    await sandboxService.onModuleDestroy();
    pass("onModuleDestroy closes mock HTTP server without uncaught exceptions");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runQaAutomationSandboxTests().catch((err) => {
  console.error("❌ Characterization tests failed:", err);
  process.exit(1);
});
