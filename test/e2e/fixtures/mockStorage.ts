import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

const CANNED_CONTAINER_LIST_XML = `<?xml version="1.0" encoding="utf-8"?>
<EnumerationResults>
  <Containers>
    <Container><Name>test-container-1</Name></Container>
    <Container><Name>test-container-2</Name></Container>
  </Containers>
</EnumerationResults>`;

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.writeHead(401, { "content-type": "application/xml" });
    res.end(
      `<?xml version="1.0" encoding="utf-8"?><Error><Code>AuthenticationFailed</Code><Message>Missing authorization header.</Message></Error>`,
    );
    return;
  }

  // GET /?comp=list
  if (url.pathname === "/" && url.searchParams.get("comp") === "list" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/xml" });
    res.end(CANNED_CONTAINER_LIST_XML);
    return;
  }

  res.writeHead(404, { "content-type": "application/xml" });
  res.end(
    `<?xml version="1.0" encoding="utf-8"?><Error><Code>NotFound</Code><Message>No route: ${url.pathname}</Message></Error>`,
  );
}

export async function startMockStorage(): Promise<{
  url: string;
  hostname: string;
  port: number;
  close: () => Promise<void>;
}> {
  const server: Server = createServer(handleRequest);

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to resolve server address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        hostname: "127.0.0.1",
        port: addr.port,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
