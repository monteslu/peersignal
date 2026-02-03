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

Or use directly in browsers via CDN:

```html
<script src="https://unpkg.com/peersignal"></script>
<script>
  const client = PeerSignal.createClient('https://your-server.com');
</script>
```

## Quick Start

```js
import { createClient } from 'peersignal';

const client = createClient('https://your-server.com');
await client.connect();
```

### Creating a Room

The peer who creates the room gets a code to share:

```js
const { code } = await client.createRoom();
console.log('Share this code:', code); // e.g., "k7m-p2x-9nf"

// Wait for peers to connect (auto-approved by default)
client.on('datachannel:open', ({ peerId }) => {
  client.send(peerId, 'Welcome!');
});

client.on('datachannel:message', ({ peerId, data }) => {
  console.log(`${peerId}: ${data}`);
});
```

> **Note:** The room creator is still a peer - all connections are direct P2P. There's no central server relaying messages.

### Joining a Room

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
| `peer:request` | `{ peerId, name }` | Peer wants to join |
| `peer:approved` | `{ hostId }` | Approved by room creator |
| `peer:denied` | - | Denied by room creator |
| `peer:connected` | `{ peerId }` | WebRTC connection established |
| `peer:disconnected` | `{ peerId }` | Peer disconnected |
| `datachannel:open` | `{ peerId, channel }` | Data channel ready |
| `datachannel:closed` | `{ peerId }` | Data channel closed |
| `datachannel:message` | `{ peerId, data }` | Message received |
| `host:disconnected` | - | Room creator went offline |
| `host:reconnected` | `{ hostId }` | Room creator came back |

## Node.js Support

Works automatically - `node-datachannel` is an optional dependency that installs with the package.

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
│  Peer A  │◄────────►│  Server  │◄────────►│  Peer B  │
└──────────┘  signal └──────────┘  signal └──────────┘
      ▲                                          ▲
      │          WebRTC (direct P2P)             │
      └──────────────────────────────────────────┘
```

1. **Peer A** creates room → gets code
2. **Peer B** joins with code → auto-approved (or manual)
3. **WebRTC** negotiation via signaling server
4. **Data channels** open for direct P2P messaging

The signaling server only helps establish the connection - all data flows directly between peers.

## License

MIT
