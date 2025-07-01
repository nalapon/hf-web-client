# Another Hyperledger Fabric SDK... But At Least This One is for the Web.

> [!WARNING]
> **This library is experimental and under heavy development.**
> The API is subject to change, and it is not recommended for production use at this time. Please use at your own risk.

Oh shiet, here we go again. Yeah, I know what you're thinking. _Another_ Fabric SDK? Before you close this tab, let me tell you this one is different: **it's a web client.**

Let's be honest, using Fabric from a browser has historically been... a myth. An urban legend. At least I have not found anything in all these years, except for an abandoned git branch from 3 years ago. It's not like the maintainers have bent over backwards to make it possible, either. I've tried it multiple times and had about as much success as Microsoft did with the Windows Phone. Remember that? Exactly.

This project is the result of that odyssey. An adventure through the rabbit hole of gRPC, gRPC-web, proxies, browser cryptography, and enough error messages to make me want to throw my laptop out the window and myself behind it.

But hey, this thing works. ...I think.

The goal of this client is to give you the tools to develop secure web applications on top of Fabric, with a laser focus on what matters most: locking down your users' credentials, their certificate, and especially, their private key.

## The Philosophy (or an attempt at one)

The idea behind this library is simple:

1.  **Paranoid Security, So You Don't Have to Be.** Private keys should never, ever, _ever_ touch the main JavaScript thread or be extractable in any way. End of discussion.
2.  **An API That Doesn't Give You Anxiety.** As a less-than-average developer and a long-suffering user of the official Fabric SDKs, their constant name changes and 300 classes and object factories make me nervous. The goal here is to have straightforward methods: `createThis()`, `sendThat()`. Simple.
3.  **Testing That Actually Works.** No more "clone this other repo, say three prayers, and see if it starts." The End-to-End testing is fully automated. One command, and you're good to go.

## "One More Thing..." — Our Security Bunker

I am obsessed with security and data security. Here's what I've built under the hood to protect the users' identities.

- **Web Worker Isolation:** All cryptographic operations (signing, encryption) happen in a completely separate thread. The main UI thread, vulnerable to XSS attacks, never even sees a private key. Your keys live in a padded cell, guarded by a very serious bouncer, and only respond to specific, secure requests.

- **God-Tier Key Derivation (PBKDF2):** We know users choose terrible passwords. That's why we use PBKDF2 with a quarter-million iterations. This turns a password like `"password123"` into a decent-level encryption key, making brute-force attacks slower... or it should be.

- **Shamir's Backup Plan (SSS):** What if a user forgets their password? When an identity is created, we use Shamir's Secret Sharing to split the master secret into "recovery shares." The user can distribute these shares to trusted friends, other devices, or a safe. To recover the account, they only need a subset of them (e.g., 3 out of 5). It's decentralized recovery, as it should be. (Note: Only share generation is implemented; recovery is not yet available.)

- **Isomorphic Design:** The core of this library works in both the browser and Node.js. This allows us to run E2E tests in a server environment and use the same codebase for desktop, CLI, and web apps.

## Current Status & Limitations

- The library is isomorphic and works in both Node.js and browser environments.
- Test credentials are not provided in the repository. To run integration or isomorphic tests, you must supply your own Fabric-compatible certificate and private key in PEM format (see example below). Do not commit private keys to the repository.
- There is currently no built-in way to generate Fabric-compatible credentials for testing. You must use credentials from your own Fabric network or generate them externally.
- Shamir's Secret Sharing is partially implemented: only share generation is present. Recovery from shares is not yet implemented.
- The test suite currently only verifies Node.js support. Browser-based automated tests are not yet included.
- Hardware-backed identity is only available in browsers with WebAuthn support and is gracefully disabled in Node.js.

Example test credentials format:

```ts
// test/test-credentials.ts
export const testCredentials = {
  certPem: `-----BEGIN CERTIFICATE-----
  ...your test certificate...
  -----END CERTIFICATE-----`,
  keyPem: `-----BEGIN PRIVATE KEY-----
  ...your test private key...
  -----END PRIVATE KEY-----`,
};
```

---

## Getting Started: From Zero to Fabric in 60 Seconds

This project is designed to get you up and running with a local Hyperledger Fabric development environment with a single command. No more hunting for credentials or configuring networks.

### 1. Installation & Setup

First, clone the repository and install the dependencies:

```bash
git clone https://github.com/nalapon/hf-web-client.git
cd hf-web-client
npm install
```

Next, run the automated setup script. This will:
1.  Download Hyperledger Fabric binaries and Docker images.
2.  Start a local Fabric test network using Docker.
3.  Deploy and initialize the `asset-transfer-basic` chaincode.
4.  Start a gRPC-web proxy to enable browser communication.
5.  **Crucially, it will automatically generate the `test/test-credentials.ts` file with the necessary certificates and keys to connect to the network.**

```bash
npm run test:setup
```

You now have a fully functional local development environment!

### 2. Running the Node.js Example

To see the client in action, run the "hello world" example. This script uses the generated credentials to connect to the network and query the chaincode for all assets.

```bash
npm run example:node
```

You should see the list of initial assets printed to your console.

### 3. Running the Tests

To verify that everything is working correctly, you can run the isomorphic tests. These tests run in a Node.js environment and cover the core functionality of the library.

```bash
npm run test:isomorphic
```

### 4. Tearing Down the Environment

When you're finished, you can tear down the entire environment with a single command. This will stop and remove all Docker containers, volumes, and generated credential files.

```bash
npm run test:teardown
```

### What is the gRPC-web Proxy?

Web browsers cannot directly communicate with gRPC services like Hyperledger Fabric's Gateway. The `gRPC-web` proxy acts as a translator.

-   Your browser sends standard HTTP requests to the proxy.
-   The proxy translates these requests into gRPC and forwards them to the Fabric Gateway.
-   The proxy receives the gRPC response, translates it back to HTTP, and sends it to your browser.

The `test:setup` script automatically configures and runs this proxy for you in a Docker container, so you don't have to worry about the details.

## What's Next? (The Roadmap)

This is just the beginning. I am working on:
- Plugins for popular frontend frameworks (React, Vue).
- Even more robust identity recovery options.

I welcome any help or advice! Feel free to open an issue or submit a pull request.

## 🚀 Isomorphic Usage (Node.js & Browser)

This library is now **fully isomorphic**: you can use it seamlessly in both Node.js (desktop, server, CLI) and browser environments.

### Quickstart: Node.js

```ts
import { IdentityService, FabricClient } from "@naladelponce/hf-web-client";
import { testCredentials } from "./test/test-credentials"; // Or load your own PEMs

// 1. Create or unlock an identity
const identityService = new IdentityService();
const password = "your-strong-password";

// Create a new identity (or use .importIdentity for existing PEMs)
const createResult = await identityService.createPasswordIdentity({
  certPem: testCredentials.certPem,
  keyPem: testCredentials.keyPem,
  password,
});
if (!createResult.success) throw createResult.error;
const appIdentity = createResult.data;

// 2. Use the identity with the Fabric client
const client = new FabricClient({
  gatewayUrl: "https://your-fabric-gateway:port",
  wsUrl: "wss://your-fabric-gateway:port/events",
  tlsCaCert: "-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----", // optional
});

const result = await client.evaluateTransaction(
  {
    mspId: "Org1MSP",
    channelName: "mychannel",
    chaincodeName: "mycc",
    functionName: "query",
    args: ["a"],
  },
  appIdentity
);

console.log(result);
```

---

### Quickstart: Browser

```js
import { IdentityService, FabricClient } from "@naladelponce/hf-web-client";

// 1. Create or unlock an identity (uses IndexedDB for storage)
const identityService = new IdentityService();
const password = prompt("Enter your password");

// Create a new identity (or use .importIdentity for existing PEMs)
const createResult = await identityService.createPasswordIdentity({
  certPem: "...", // Your PEM
  keyPem: "...", // Your PEM
  password,
});
if (!createResult.success) throw createResult.error;
const appIdentity = createResult.data;

// 2. Use the identity with the Fabric client
const client = new FabricClient({
  gatewayUrl: "https://your-fabric-gateway:port",
  wsUrl: "wss://your-fabric-gateway:port/events",
  tlsCaCert: "-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----", // optional
});

const result = await client.evaluateTransaction(
  {
    mspId: "Org1MSP",
    channelName: "mychannel",
    chaincodeName: "mycc",
    functionName: "query",
    args: ["a"],
  },
  appIdentity
);

console.log(result);
```

---

### Environment Differences

- **Node.js**: Uses the filesystem for secure identity storage (`FileStore`).
- **Browser**: Uses IndexedDB for secure identity storage (`IndexedDBStore`).
- **Hardware-backed identity**: Only available in browsers with WebAuthn support.
- **WebSockets**: Uses `ws` in Node.js, browser-native in browser.

---

### Test It Yourself

- Run `pnpm test:isomorphic` to verify Node.js support.
- See `test/isomorphic.test.ts` for a full working example.

### ⚠️ Test Credentials

For integration or isomorphic tests, you must provide your own test certificate and private key in PEM format.
**Do not commit private keys to the repository.**

Example format:

```ts
export const testCredentials = {
  certPem: `-----BEGIN CERTIFICATE-----
...your test certificate...
-----END CERTIFICATE-----`,
  keyPem: `-----BEGIN PRIVATE KEY-----
...your test private key...
-----END PRIVATE KEY-----`,
};
```
