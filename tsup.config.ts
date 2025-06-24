import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  dts: true,
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
  splitting: false,
  external: [
    "@bufbuild/protobuf",
    "@connectrpc/connect",
    "@connectrpc/connect-web",
    "bn.js",
  ],
});
