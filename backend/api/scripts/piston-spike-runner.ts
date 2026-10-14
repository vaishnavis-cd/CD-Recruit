import * as fs from "fs";
import * as path from "path";

const PISTON_URL = process.env.PISTON_URL || "http://127.0.0.1:2000";

interface PistonExecuteRequest {
  language: string;
  version?: string;
  files: Array<{ name: string; content: string }>;
  stdin?: string;
  args?: string[];
  run_timeout?: number;
  compile_timeout?: number;
  run_memory_limit?: number;
  compile_memory_limit?: number;
}

async function postJson(endpoint: string, body: any): Promise<{ status: number; data: any; durationMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${PISTON_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const durationMs = Date.now() - start;
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, durationMs };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return { status: 0, data: { error: err.message }, durationMs };
  }
}

async function getJson(endpoint: string): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(`${PISTON_URL}${endpoint}`);
    const data = await res.json();
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 0, data: { error: err.message } };
  }
}

async function waitForPistonReady(retries = 30, delayMs = 1000): Promise<boolean> {
  console.log(`Connecting to Piston at ${PISTON_URL}...`);
  for (let i = 0; i < retries; i++) {
    const res = await getJson("/api/v2/packages");
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✔ Piston ready. Available packages: ${res.data.length}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function installPackage(language: string, version: string): Promise<boolean> {
  console.log(`Installing ${language}=${version}...`);
  const res = await postJson("/api/v2/packages", { language, version });
  if (res.status === 200) {
    console.log(`✔ Installed ${language}=${version}`);
    return true;
  } else {
    console.warn(`ℹ Response for ${language}=${version}: ${res.status}`, res.data);
    return res.status === 200;
  }
}

async function main() {
  const ready = await waitForPistonReady();
  if (!ready) {
    console.error("❌ Piston container is not responding. Ensure it is running.");
    process.exit(1);
  }

  // 1. Inspect installed runtimes
  const runtimesRes = await getJson("/api/v2/runtimes");
  const installed: any[] = Array.isArray(runtimesRes.data) ? runtimesRes.data : [];
  console.log(`Currently installed runtimes:`, installed.map((r: any) => `${r.language}=${r.version}`));

  const targetPackages = [
    { language: "python", version: "3.10.0" },
    { language: "java", version: "15.0.2" },
    { language: "gcc", version: "10.2.0" },
    { language: "node", version: "18.15.0" },
  ];

  for (const pkg of targetPackages) {
    const isInstalled = installed.some((r: any) => r.language === pkg.language);
    if (!isInstalled) {
      await installPackage(pkg.language, pkg.version);
    } else {
      console.log(`✔ ${pkg.language} already installed.`);
    }
  }

  const results: Record<string, any> = {};

  console.log("\n=======================================================");
  console.log("🧪 RUNNING EMPIRICAL SPIKE SUITE (FIXTURES 1 - 9)");
  console.log("=======================================================\n");

  // Fixture 1: Success (Python)
  console.log("▶ Fixture 1: Success (Python)");
  const f1 = await postJson("/api/v2/execute", {
    language: "python",
    version: "*",
    files: [{ name: "solution.py", content: "print(\"OK\")" }],
  });
  results["fixture1_success"] = f1;
  console.log(`  HTTP ${f1.status} (${f1.durationMs}ms):`, JSON.stringify(f1.data.run || f1.data));

  // Fixture 2: Timeout (Infinite loop)
  console.log("▶ Fixture 2: Timeout (Python infinite loop)");
  const f2 = await postJson("/api/v2/execute", {
    language: "python",
    version: "*",
    run_timeout: 1000,
    files: [{ name: "solution.py", content: "while True: pass" }],
  });
  results["fixture2_timeout"] = f2;
  console.log(`  HTTP ${f2.status} (${f2.durationMs}ms):`, JSON.stringify(f2.data.run || f2.data));

  // Fixture 3a: OOM (Python 300MB allocation with 64MB cap)
  console.log("▶ Fixture 3a: Over-Memory (Python 300MB allocation with 64MB cap)");
  const f3a = await postJson("/api/v2/execute", {
    language: "python",
    version: "*",
    run_memory_limit: 67108864,
    files: [{ name: "solution.py", content: "x = bytearray(300 * 1024 * 1024)" }],
  });
  results["fixture3a_oom_python"] = f3a;
  console.log(`  HTTP ${f3a.status} (${f3a.durationMs}ms):`, JSON.stringify(f3a.data.run || f3a.data));

  // Fixture 3b: OOM (C++ new char allocation with 64MB cap)
  console.log("▶ Fixture 3b: Over-Memory (C++ 300MB allocation with 64MB cap)");
  const f3b = await postJson("/api/v2/execute", {
    language: "c++",
    version: "*",
    run_memory_limit: 67108864,
    files: [{ name: "solution.cpp", content: "#include <iostream>\nint main() { char* p = new char[300 * 1024 * 1024]; p[0] = 1; std::cout << p[0]; return 0; }" }],
  });
  results["fixture3b_oom_cpp"] = f3b;
  console.log(`  HTTP ${f3b.status} (${f3b.durationMs}ms):`, JSON.stringify(f3b.data.run || f3b.data));

  // Fixture 4: Runtime Error (non-zero exit)
  console.log("▶ Fixture 4: Runtime Error (sys.exit 42)");
  const f4 = await postJson("/api/v2/execute", {
    language: "python",
    version: "*",
    files: [{ name: "solution.py", content: "import sys; sys.exit(42)" }],
  });
  results["fixture4_runtime_error"] = f4;
  console.log(`  HTTP ${f4.status} (${f4.durationMs}ms):`, JSON.stringify(f4.data.run || f4.data));

  // Fixture 5: Compile Error (C++)
  console.log("▶ Fixture 5: Compile Error (C++ syntax error)");
  const f5 = await postJson("/api/v2/execute", {
    language: "c++",
    version: "*",
    files: [{ name: "solution.cpp", content: "int main() { syntax error here; }" }],
  });
  results["fixture5_compile_error"] = f5;
  console.log(`  HTTP ${f5.status} (${f5.durationMs}ms):`, JSON.stringify(f5.data.compile || f5.data));

  // Fixture 6: Large Output (Infinite print)
  console.log("▶ Fixture 6: Large Output (Output flooding)");
  const f6 = await postJson("/api/v2/execute", {
    language: "python",
    version: "*",
    files: [{ name: "solution.py", content: "for _ in range(20000): print(\"A\" * 50)" }],
  });
  results["fixture6_large_output"] = f6;
  console.log(`  HTTP ${f6.status} (${f6.durationMs}ms): stdout length=${(f6.data.run?.stdout || "").length}`, JSON.stringify({ status: f6.data.run?.status, signal: f6.data.run?.signal }));

  // Fixture 7: Internal Error / Unsupported Language
  console.log("▶ Fixture 7: Internal Fault (Non-existent language)");
  const f7 = await postJson("/api/v2/execute", {
    language: "non_existent_lang_123",
    version: "*",
    files: [{ name: "test.txt", content: "hello" }],
  });
  results["fixture7_invalid_lang"] = f7;
  console.log(`  HTTP ${f7.status} (${f7.durationMs}ms):`, JSON.stringify(f7.data));

  // Fixture 8: Java Class Naming Tests
  console.log("\n▶ Fixture 8: Java Class Naming Matrix");
  
  // 8a: public class Main with Main.java
  const f8a = await postJson("/api/v2/execute", {
    language: "java",
    version: "*",
    files: [{ name: "Main.java", content: "public class Main { public static void main(String[] args) { System.out.println(\"Main OK\"); } }" }],
  });
  results["fixture8a_java_main_in_main"] = f8a;
  console.log(`  8a. public class Main with Main.java: HTTP ${f8a.status}, run:`, JSON.stringify(f8a.data.run || f8a.data.compile));

  // 8b: public class Solution with Solution.java
  const f8b = await postJson("/api/v2/execute", {
    language: "java",
    version: "*",
    files: [{ name: "Solution.java", content: "public class Solution { public static void main(String[] args) { System.out.println(\"Solution OK\"); } }" }],
  });
  results["fixture8b_java_solution_in_solution"] = f8b;
  console.log(`  8b. public class Solution with Solution.java: HTTP ${f8b.status}, run:`, JSON.stringify(f8b.data.run || f8b.data.compile));

  // 8c: public class Main with Solution.java (Mismatched)
  const f8c = await postJson("/api/v2/execute", {
    language: "java",
    version: "*",
    files: [{ name: "Solution.java", content: "public class Main { public static void main(String[] args) { System.out.println(\"Mismatch\"); } }" }],
  });
  results["fixture8c_java_main_in_solution"] = f8c;
  console.log(`  8c. public class Main with Solution.java (Mismatch): HTTP ${f8c.status}, compile stderr:`, JSON.stringify(f8c.data.compile?.stderr || f8c.data));

  // 8d: public final class Main with Main.java
  const f8d = await postJson("/api/v2/execute", {
    language: "java",
    version: "*",
    files: [{ name: "Main.java", content: "public final class Main { public static void main(String[] args) { System.out.println(\"Final Main OK\"); } }" }],
  });
  results["fixture8d_java_final_main"] = f8d;
  console.log(`  8d. public final class Main with Main.java: HTTP ${f8d.status}, run:`, JSON.stringify(f8d.data.run || f8d.data.compile));

  // 8e: package declaration
  const f8e = await postJson("/api/v2/execute", {
    language: "java",
    version: "*",
    files: [{ name: "Main.java", content: "package com.example;\npublic class Main { public static void main(String[] args) { System.out.println(\"Package OK\"); } }" }],
  });
  results["fixture8e_java_package"] = f8e;
  console.log(`  8e. package declaration with Main.java: HTTP ${f8e.status}, result:`, JSON.stringify(f8e.data.run || f8e.data.compile));

  // Fixture 9: Concurrency Test (4 vs 8 concurrent requests)
  console.log("\n▶ Fixture 9: Concurrency Benchmark");
  const javaPayload = {
    language: "java",
    version: "*",
    files: [{ name: "Main.java", content: "public class Main { public static void main(String[] args) throws Exception { Thread.sleep(200); System.out.println(\"Bench OK\"); } }" }],
  };

  console.log("  Testing 4 concurrent Java executions (100% of Piston slots)...");
  const start4 = Date.now();
  const res4 = await Promise.all([
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
  ]);
  const duration4 = Date.now() - start4;
  console.log(`  ✔ 4 concurrent requests finished in ${duration4}ms (avg per request: ${Math.round(duration4 / 4)}ms)`);
  results["fixture9a_concurrency_4"] = { totalDurationMs: duration4, individual: res4.map((r) => ({ status: r.status, durationMs: r.durationMs })) };

  console.log("  Testing 8 concurrent Java executions (200% of Piston slots - queue buffering)...");
  const start8 = Date.now();
  const res8 = await Promise.all([
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
    postJson("/api/v2/execute", javaPayload),
  ]);
  const duration8 = Date.now() - start8;
  console.log(`  ✔ 8 concurrent requests finished in ${duration8}ms (avg per request: ${Math.round(duration8 / 8)}ms)`);
  results["fixture9b_concurrency_8"] = { totalDurationMs: duration8, individual: res8.map((r) => ({ status: r.status, durationMs: r.durationMs })) };

  // Write results file
  const outPath = path.resolve(__dirname, "../../../docs/piston-spike-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\n✅ Spike completed! Raw results saved to: ${outPath}`);
}

main().catch((err) => {
  console.error("❌ Spike execution failed:", err);
  process.exit(1);
});
