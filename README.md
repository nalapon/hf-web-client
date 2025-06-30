# Another Hyperledger Fabric SDK... But At Least This One is for the Web.

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

## Quick Start: From Zero to Fabric in 60 Seconds

Enough talk. Let's see some code. Here's how you evaluate a transaction against a running network.
Let's take into consideration that this projects needs a proxy, a grpc-web proxy to work.
TODO: explain this part.

#### 1. Installation

```bash
npm install @naladelponce/hf-web-client
# or
pnpm add @naladelponce/hf-web-client
```

---

## Listening for Network Events

So, you've sent a transaction. Now what? You wait? Refresh the page like it's 2005? No. You listen for events. This client gives you two ways to do that, because Fabric is "special" and has two different event streams.

### 1. Listening for Chaincode Events

This is what you'll use most of the time. Your chaincode screams into the void, and you want to hear it. This uses the Gateway's event stream.

**Use Case:** Your chaincode emits an `AssetCreated` event, and you want your UI to update in real-time without the user hitting refresh.

```typescript
import { FabricClient } from "@nalapon/hf-web-client";

async function listenForChaincode(client: FabricClient, identity: AppIdentity) {
  console.log("Setting up chaincode event listener...");

  // AbortController is your friend. It's how you say "okay, I'm done listening."
  const abortController = new AbortController();
  const signal = abortController.signal;

  // This returns an AsyncGenerator. It's a fancy loop that waits for new events.
  const eventStream = client.listenToChaincodeEvents(
    {
      mspId: MSP_ID,
      channelName: CHANNEL_NAME,
      chaincodeName: CHAINCODE_NAME,
    },
    identity,
    signal,
  );

  try {
    for await (const event of eventStream) {
      console.log("🎉 New Chaincode Event Received:", event);
      // Your logic here: update UI, show a notification, etc.
      // Example: if (event.eventName === 'AssetCreated') { ... }

      // If you want to stop listening after the first event, you can do this:
      // abortController.abort();
    }
  } catch (error) {
    if (signal.aborted) {
      console.log("Event listener was gracefully stopped.");
    } else {
      console.error("🔥 Ouch! Event listener crashed:", error);
    }
  }
}

// Example of how to stop it after 10 seconds
// setTimeout(() => abortController.abort(), 10000);
```

### 2. Listening for Block Events

This is more low-level. You get a notification for every single block committed to the channel. It's powerful, but also noisy. This requires a direct connection to a peer (via a WebSocket proxy, because browsers).

**Use Case:** You're building a block explorer, a monitoring dashboard, or you just enjoy watching the world burn, one block at a time.

```typescript
import { FabricClient } from "@nalapon/hf-web-client";

// You'll need the WebSocket proxy URL for this one.
const WS_PROXY_URL = "ws://localhost:7052"; 

async function listenForBlocks(identity: AppIdentity) {
  // Note that wsUrl is now part of the client config
  const client = new FabricClient({ gatewayUrl: GATEWAY_PROXY_URL, wsUrl: WS_PROXY_URL });
  
  console.log("Setting up block event listener...");

  const abortController = new AbortController();
  const signal = abortController.signal;

  const blockStream = client.listenToBlockEvents(
    {
      mspId: MSP_ID,
      channelName: CHANNEL_NAME,
      // You need to specify which peer to listen to.
      targetPeer: "peer0.org1.example.com", 
      targetHostname: "peer0.org1.example.com", // And its hostname for TLS
    },
    identity,
    signal,
  );

  try {
    for await (const block of blockStream) {
      console.log(`📦 New Block Committed: #${block.number}`);
      // The block is a "FilteredBlock", so it has transactions but not all the details.
      console.log(`  - Contains ${block.filteredTransactions.length} transactions.`);
    }
  } catch (error) {
    if (signal.aborted) {
      console.log("Block listener was gracefully stopped.");
    } else {
      console.error("🔥 Block listener crashed:", error);
    }
  }
}
```

---

## Development & Testing

The entire test infrastructure is kinda automated. To run a full End-to-End test suite that:

1.  Downloads Fabric and its binaries (if needed).
2.  Spins up a Docker network (if needed).
3.  Deploys and initializes a chaincode (asset-transfer-basic)
4.  Runs a comprehensive suite of tests against it (For now it is not comprehensive or anything. WIP)

...all you have to do is run:

```bash
npm run test:e2e
```

Seriously. That's it. I do not like projects with long setups. For a total cleanup, run `npm run test:e2e:teardown`.

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
