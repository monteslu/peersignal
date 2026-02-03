// Browser WebRTC implementation using native RTCPeerConnection
import createDebug from 'debug';

const debug = createDebug('peersignal:rtc-web');

const defaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

export function isAvailable() {
  return typeof RTCPeerConnection !== 'undefined';
}

export function createPeerConnection(iceServers = defaultIceServers) {
  return new RTCPeerConnection({ iceServers });
}

export async function createOffer(pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

export async function createAnswer(pc, offer) {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp };
}

export async function setRemoteDescription(pc, desc) {
  await pc.setRemoteDescription(new RTCSessionDescription(desc));
}

export async function addIceCandidate(pc, candidate) {
  await pc.addIceCandidate(new RTCIceCandidate({
    candidate: candidate.candidate,
    sdpMid: candidate.mid || '0',
  }));
}

export function createDataChannel(pc, label) {
  return pc.createDataChannel(label);
}

export function onDataChannel(pc, callback) {
  pc.ondatachannel = (event) => callback(event.channel);
}

export function onLocalCandidate(pc, callback) {
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callback({
        candidate: event.candidate.candidate,
        mid: event.candidate.sdpMid,
      });
    }
  };
}

export function onStateChange(pc, callback) {
  pc.onconnectionstatechange = () => callback(pc.connectionState);
}

// DataChannel helpers
export function dcOnOpen(dc, callback) {
  dc.onopen = callback;
}

export function dcOnMessage(dc, callback) {
  dc.onmessage = (event) => callback(event.data);
}

export function dcOnClose(dc, callback) {
  dc.onclose = callback;
}

export function dcSend(dc, data) {
  dc.send(data);
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
