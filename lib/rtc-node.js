// Node.js WebRTC implementation using node-datachannel
import createDebug from 'debug';

const debug = createDebug('peersignal:rtc-node');

let nodeDataChannel;
try {
  nodeDataChannel = await import('node-datachannel');
  if (nodeDataChannel.default) {
    nodeDataChannel = nodeDataChannel.default;
  }
} catch (e) {
  debug('node-datachannel not installed:', e.message);
}

const defaultIceServers = ['stun:stun.l.google.com:19302'];

export function isAvailable() {
  return !!nodeDataChannel?.PeerConnection;
}

export function createPeerConnection(iceServers = defaultIceServers) {
  if (!nodeDataChannel?.PeerConnection) {
    throw new Error('node-datachannel not installed. Run: npm install node-datachannel');
  }
  return new nodeDataChannel.PeerConnection('pc', { iceServers });
}

export async function createOffer(pc) {
  pc.setLocalDescription();
  // node-datachannel creates SDP synchronously
  await new Promise(r => setTimeout(r, 10));
  return pc.localDescription();
}

export async function createAnswer(pc, offer) {
  pc.setRemoteDescription(offer.sdp, offer.type);
  pc.setLocalDescription();
  await new Promise(r => setTimeout(r, 10));
  const desc = pc.localDescription();
  // Fix SDP: answers must have a=setup:passive or a=setup:active, not actpass
  let sdp = desc.sdp;
  if (sdp && sdp.includes('a=setup:actpass')) {
    sdp = sdp.replace(/a=setup:actpass/g, 'a=setup:active');
  }
  return { type: desc.type, sdp };
}

export function setRemoteDescription(pc, desc) {
  pc.setRemoteDescription(desc.sdp, desc.type);
}

export function addIceCandidate(pc, candidate) {
  pc.addRemoteCandidate(candidate.candidate, candidate.mid || '0');
}

export function createDataChannel(pc, label) {
  return pc.createDataChannel(label);
}

export function onDataChannel(pc, callback) {
  pc.onDataChannel(callback);
}

export function onLocalCandidate(pc, callback) {
  pc.onLocalCandidate((candidate, mid) => {
    callback({ candidate, mid });
  });
}

export function onStateChange(pc, callback) {
  pc.onStateChange(callback);
}

// DataChannel helpers
export function dcOnOpen(dc, callback) {
  dc.onOpen(callback);
}

export function dcOnMessage(dc, callback) {
  dc.onMessage(callback);
}

export function dcOnClose(dc, callback) {
  dc.onClosed(callback);
}

export function dcSend(dc, data) {
  if (typeof data === 'string') {
    dc.sendMessage(data);
  } else {
    dc.sendMessageBinary(data);
  }
}

export default {
  isAvailable,
  createPeerConnection,
  createOffer,
  createAnswer,
  setRemoteDescription,
  addIceCandidate,
  createDataChannel,
  onDataChannel,
  onLocalCandidate,
  onStateChange,
  dcOnOpen,
  dcOnMessage,
  dcOnClose,
  dcSend,
};
