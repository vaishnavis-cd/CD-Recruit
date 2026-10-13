import { PistonClient } from "./piston.client";
import { PistonRawResponse } from "./piston.contracts";

describe("PistonClient", () => {
  let client: PistonClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new PistonClient();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("successfully executes code on 200 response", async () => {
    const mockResponse: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 0,
        stdout: "Hello\n",
        stderr: "",
        wall_time: 120,
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    } as any);

    const res = await client.execute("python", "*", [{ name: "main.py", content: "print('Hello')" }]);

    expect(res.language).toBe("python");
    expect(res.run?.code).toBe(0);
    expect(res.run?.stdout).toBe("Hello\n");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times on transient 500 error and succeeds on 3rd attempt", async () => {
    const mockSuccess: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: { code: 0, stdout: "Recovered\n" },
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue("Service Unavailable"),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: jest.fn().mockResolvedValue("Bad Gateway"),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockSuccess),
      } as any);

    const res = await client.execute("python", "*", [{ name: "main.py", content: "print('Recovered')" }]);

    expect(res.run?.stdout).toBe("Recovered\n");
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on 400 client error without retrying", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue("Unknown language"),
    } as any);

    await expect(
      client.execute("invalid_lang", "*", [{ name: "test.txt", content: "" }]),
    ).rejects.toThrow("Piston error (400)");

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns true on successful checkHealth", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const healthy = await client.checkHealth();
    expect(healthy).toBe(true);
  });

  it("returns false on failed checkHealth", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Connection refused"));

    const healthy = await client.checkHealth();
    expect(healthy).toBe(false);
  });
});
