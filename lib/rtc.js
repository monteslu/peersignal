// Auto-select WebRTC implementation based on environment
let rtc;

// Check if we're in Node.js or browser
const isNode = typeof process !== 'undefined' && 
               process.versions != null && 
               process.versions.node != null;

if (isNode) {
  // Node.js - use node-datachannel
  rtc = await import('./rtc-node.js');
} else {
  // Browser - use native RTCPeerConnection
  rtc = await import('./rtc-web.js');
}

export const {
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
} = rtc.default || rtc;

export default rtc.default || rtc;
