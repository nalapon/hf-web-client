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

- **💻 Web Worker Isolation:** All cryptographic operations (signing, encryption) happen in a completely separate thread. The main UI thread, vulnerable to XSS attacks, never even sees a private key. Your keys live in a padded cell, guarded by a very serious bouncer, and only respond to specific, secure requests.

- **🔐 God-Tier Key Derivation (PBKDF2):** We know users choose terrible passwords. That's why we use PBKDF2 with a quarter-million iterations. This turns a password like `"password123"` into a decent-level encryption key, making brute-force attacks slower... or it should be.

- **🤫 Shamir's Backup Plan (SSS):** What if a user forgets their password? When an identity is created, we use Shamir's Secret Sharing to split the master secret into "recovery shares." Think of them like Voldemort's Horcruxes. The user can distribute these shares to trusted friends, other devices, or a safe. To recover the account, they only need a subset of them (e.g., 3 out of 5). It's decentralized recovery, as it should be.

- **🌍 Isomorphic-ish Design:** In theory, the core of this library should work in both the browser and Node.js. This allows us to run lightning-fast E2E tests in a server environment. Is it thoroughly tested? Nope. Does it work? I hope so. Pull Requests are welcome!

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

#### 2. The Code

```typescript
import { FabricClient, IdentityService } from "@nalapon/hf-web-client";

// --- CONFIGURATION ---
const GATEWAY_PROXY_URL = "http://localhost:8088"; // Your gateway proxy
const MSP_ID = "Org1MSP";
const CHANNEL_NAME = "mychannel";
const CHAINCODE_NAME = "basic";

// A placeholder to show the structure. In a real app,
// you'd get this from `identityService.unlockIdentity()`.
async function getMyIdentity() {
  const myUnlockedIdentity = {
    cert: "-----BEGIN CERTIFICATE-----\n...",
    sign: async (dataToSign: Uint8Array): Promise<Uint8Array> => {
      // This method is secretly connected to the secure worker.
      console.log("Signing data of length:", dataToSign.length);
      // ... returns a real signature ...
      return new Uint8Array(64);
    },
  };
  return myUnlockedIdentity;
}

async function main() {
  console.log("Initializing clients...");
  const fabricClient = new FabricClient({ gatewayUrl: GATEWAY_URL });
  const identity = await getMyIdentity();

  console.log("Evaluating transaction: GetAllAssets...");

  const result = await fabricClient.evaluateTransaction(
    {
      mspId: MSP_ID,
      channelName: CHANNEL_NAME,
      chaincodeName: CHAINCODE_NAME,
      functionName: "GetAllAssets",
    },
    identity,
  );

  if (result.success) {
    console.log("✅ Success! Assets found:", result.data.parsedData);
  } else {
    console.error("❌ Transaction failed!", result.error.message);
  }
}

main().catch(console.error);
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

- Full implementation of the `EventService` for real-time block and chaincode events.
- Plugins for popular frontend frameworks (React, Vue).
- Even more robust identity recovery options.

I welcome any help or advice! Feel free to open an issue or submit a pull request.
