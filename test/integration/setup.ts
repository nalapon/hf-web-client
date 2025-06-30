import { vi } from "vitest";

vi.mock("@connectrpc/connect-web", async () => {
  const mod = await import("@connectrpc/connect-node");
  return {
    // re-export everything (if you need other exports), but
    // override createGrpcWebTransport to call the Node version:
    ...mod,
    createGrpcWebTransport: (opts: any) =>
      mod.createGrpcWebTransport({
        ...opts,
        // grpcweb-proxy only speaks HTTP/1.1
        httpVersion: "1.1",
      }),
  };
});
