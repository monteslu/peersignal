# peersignal

WebRTC signaling client with code-based P2P pairing.

## Install

```bash
npm install peersignal
```

Or in browser:
```html
<script src="https://your-server.com/peersignal.js"></script>
```

## Usage

```js
import { createClient } from 'peersignal';

const client = createClient('https://your-server.com');
await client.connect();

// As host:
const { code } = await client.createRoom();
console.log('Share this code:', code); // e.g., "k7m-p2x-9nf"

client.on('peer:request', ({ peerId, name }) => {
  console.log(`${name} wants to join`);
  client.approvePeer(peerId, true);
});

client.on('peer:connected', ({ peerId }) => {
  client.send(peerId, 'Welcome!');
});

// As peer:
await client.joinRoom('k7m-p2x-9nf', 'Bob');

client.on('peer:approved', () => console.log('Approved!'));
client.on('peer:connected', () => console.log('Connected!'));

client.on('datachannel:message', ({ peerId, data }) => {
  console.log(`${peerId}: ${data}`);
});
```

## API

### `createClient(serverUrl, options?)`

Create a client instance.

### Client Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to server |
| `createRoom()` | Create room → `{ code, iceServers }` |
| `joinRoom(code, name)` | Join room as peer |
| `approvePeer(peerId, approved)` | Approve/deny peer (host only) |
| `send(peerId, data)` | Send to specific peer |
| `broadcast(data)` | Send to all peers |
| `disconnect()` | Disconnect |

### Events

| Event | Data | Description |
|-------|------|-------------|
| `peer:request` | `{ peerId, name }` | Peer wants to join |
| `peer:approved` | `{ hostId }` | Approved by host |
| `peer:denied` | - | Denied by host |
| `peer:connected` | `{ peerId }` | P2P connected |
| `peer:disconnected` | `{ peerId }` | Peer left |
| `datachannel:message` | `{ peerId, data }` | Message received |

## Server

See [peersignal-server](https://github.com/monteslu/peersignal-server).

## License

MIT
