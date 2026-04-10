import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

export interface TestServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function randomPort(): number {
  return 10_000 + Math.floor(Math.random() * 50_000);
}

/**
 * Spawns the agc-auth-helper server in a child process with custom env vars.
 * Waits for the "listening" log line, then returns the URL and a cleanup function.
 */
export async function startTestServer(env: Record<string, string> = {}): Promise<TestServer> {
  const port = randomPort();
  const projectRoot = resolve(import.meta.dirname, "..", "..", "..");
  const entryPoint = resolve(projectRoot, "src", "index.ts");

  const child: ChildProcess = spawn(
    resolve(projectRoot, "node_modules", ".bin", "tsx"),
    [entryPoint],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
        AZURE_CLOUD: "azure-us-government",
        AUTH_MODE: "environment",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const cleanup = async (): Promise<void> => {
    if (!child.killed) {
      child.kill("SIGTERM");
      // Give the process a moment to shut down gracefully
      await new Promise<void>((res) => {
        child.on("exit", () => res());
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
          res();
        }, 3_000);
      });
    }
  };

  return new Promise<TestServer>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup().then(() => reject(new Error("Test server failed to start within 10 seconds")));
    }, 10_000);

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString();
      // The server prints: "Sovereign auth reference app listening on http://localhost:PORT ..."
      if (output.includes("listening")) {
        clearTimeout(timeout);
        resolve({
          url: `http://localhost:${port}`,
          port,
          close: cleanup,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn test server: ${err.message}`));
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Test server exited with code ${code}. stderr: ${stderr}`));
      }
    });
  });
}
