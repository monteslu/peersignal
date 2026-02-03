# peersignal

[![npm version](https://img.shields.io/npm/v/peersignal.svg)](https://www.npmjs.com/package/peersignal)
[![CI](https://github.com/monteslu/peersignal/actions/workflows/ci.yml/badge.svg)](https://github.com/monteslu/peersignal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

WebRTC signaling client with code-based P2P pairing. Works in **Node.js** and **browsers**.

Share a simple code (like `k7m-p2x-9nf`), connect peer-to-peer, send data directly. No complex setup.

## Features

- 🔗 **Code-based pairing** - Share a short code to connect
- 🌐 **Universal** - Works in Node.js and browsers
- ⚡ **Auto-approve** - Knowing the code is trust (configurable)
- 📡 **WebRTC data channels** - Direct P2P messaging
- 🧊 **Trickle ICE** - Fast connection establishment

## Install

```bash
npm install peersignal
```

For Node.js, also install the WebRTC implementation:

```bash
npm install node-datachannel
```

## Quick Start

```js
import { createClient } from 'peersignal';

const client = createClient('https://your-server.com');
await client.connect();
```

### Host

```js
const { code } = await client.createRoom();
console.log('Share this code:', code); // e.g., "k7m-p2x-9nf"

// Peers are auto-approved by default - just wait for connection
client.on('datachannel:open', ({ peerId }) => {
  client.send(peerId, 'Welcome!');
});

client.on('datachannel:message', ({ peerId, data }) => {
  console.log(`${peerId}: ${data}`);
});
```

### Peer

```js
await client.joinRoom('k7m-p2x-9nf', 'Alice');

client.on('datachannel:open', ({ peerId }) => {
  client.send(peerId, 'Hello!');
});

client.on('datachannel:message', ({ peerId, data }) => {
  console.log(`Received: ${data}`);
});
```

### Manual Approval (optional)

If you want to manually approve peers:

```js
const client = createClient('https://your-server.com', {
  autoApprove: false
});

client.on('peer:request', ({ peerId, name }) => {
  console.log(`${name} wants to join`);
  // Approve or deny
  client.approvePeer(peerId, true);  // or false to deny
});
```

## API

### `createClient(serverUrl, options?)`

Create a client instance.

**Options:**
- `name` - Display name for this peer (default: `'Anonymous'`)
- `autoApprove` - Auto-approve peers with the code (default: `true`)
- `iceServers` - Custom ICE servers array
- `socketOptions` - Options passed to socket.io-client

### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to signaling server |
| `createRoom()` | Create room, returns `{ code, iceServers }` |
| `joinRoom(code, name?)` | Join room with code |
| `approvePeer(peerId, approved?)` | Approve/deny peer (when `autoApprove: false`) |
| `send(peerId, data)` | Send data to specific peer |
| `broadcast(data)` | Send data to all connected peers |
| `disconnect()` | Disconnect and cleanup |

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | - | Connected to signaling server |
| `disconnected` | - | Disconnected from server |
| `peer:request` | `{ peerId, name }` | Peer wants to join (fires before auto-approve) |
| `peer:approved` | `{ hostId }` | Approved by host (peer only) |
| `peer:denied` | - | Denied by host (peer only) |
| `peer:connected` | `{ peerId }` | WebRTC connection established |
| `peer:disconnected` | `{ peerId }` | Peer disconnected |
| `datachannel:open` | `{ peerId, channel }` | Data channel ready |
| `datachannel:closed` | `{ peerId }` | Data channel closed |
| `datachannel:message` | `{ peerId, data }` | Message received |
| `host:disconnected` | - | Host went offline |
| `host:reconnected` | `{ hostId }` | Host came back |

## Node.js Support

peersignal works in Node.js via [node-datachannel](https://github.com/murat-dogan/node-datachannel).

```bash
npm install node-datachannel
```

The library auto-detects the environment:
- **Node.js** → node-datachannel
- **Browser** → native RTCPeerConnection

## Server

You need a [peersignal-server](https://github.com/monteslu/peersignal-server) instance.

```bash
npx peersignal-server --port 3000
```

## How It Works

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│   Host   │◄────────►│  Server  │◄────────►│   Peer   │
└──────────┘  signal └──────────┘  signal └──────────┘
      ▲                                          ▲
      │          WebRTC (direct P2P)             │
      └──────────────────────────────────────────┘
```

1. **Host** creates room → gets code
2. **Peer** joins with code → auto-approved (or manual)
3. **WebRTC** negotiation via signaling server
4. **Data channels** open for direct P2P messaging

## License

MIT
