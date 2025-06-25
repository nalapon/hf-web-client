import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  clean: true,
  dts: {
    resolve: true,
  },
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
  splitting: false,
  treeshake: true,
  minify: false, // Keep readable for debugging
  external: [
    "@bufbuild/protobuf",
    "@connectrpc/connect",
    "@connectrpc/connect-web",
    "@noble/hashes",
    "@scure/bip39",
    "@simplewebauthn/browser",
    "@zxcvbn-ts/core",
    "bn.js",
    "buffer",
    "idb-keyval",
    "jose",
    "jsrsasign",
    "shamir-secret-sharing"
  ],
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".js" : ".cjs",
    };
  },
});
