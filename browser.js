// Browser-specific entry point
import rtc from './lib/rtc-web.js';
import { io } from 'socket.io-client';
import rawr from 'rawr';

// Browser-compatible EventEmitter (minimal implementation)
class EventEmitter {
  constructor() {
    this._events = {};
  }
  on(event, listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }
  off(event, listener) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(l => l !== listener);
    return this;
  }
  emit(event, ...args) {
    if (!this._events[event]) return false;
    this._events[event].forEach(listener => listener(...args));
    return true;
  }
  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
  removeAllListeners(event) {
    if (event) {
      delete this._events[event];
    } else {
      this._events = {};
    }
    return this;
  }
}

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export class PeerSignalClient extends EventEmitter {
  constructor(serverUrl, options = {}) {
    super();
    this.serverUrl = serverUrl;
    this.options = options;
    this.socket = null;
    this.rpc = null;
    this.code = null;
    this.isHost = false;
    this.iceServers = options.iceServers || DEFAULT_ICE_SERVERS;
    this.autoApprove = options.autoApprove !== undefined ? options.autoApprove : true;
    this.pendingPeers = new Map();
    this.peerConnections = new Map();
    this.dataChannels = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        ...this.options.socketOptions
      });

      this.socket.on('connect', () => {
        this.rpc = rawr({ channel: this.socket });
        this._setupRpcHandlers();
        this.emit('connected');
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.emit('disconnected');
      });

      this.socket.on('connect_error', (error) => {
        this.emit('error', error);
        reject(error);
      });
    });
  }

  _setupRpcHandlers() {
    this.rpc.notifications.peerWaiting = (peerId, metadata) => {
      if (this.autoApprove) {
        this.approvePeer(peerId);
      } else {
        this.pendingPeers.set(peerId, metadata);
        this.emit('peerWaiting', peerId, metadata);
      }
    };

    this.rpc.notifications.peerApproved = () => {
      this.emit('approved');
      this._initiatePeerConnection(false);
    };

    this.rpc.notifications.peerRejected = () => {
      this.emit('rejected');
    };

    this.rpc.notifications.signal = async (signal) => {
      const pc = this.peerConnections.get('peer');
      if (!pc) return;

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.rpc.notifications.signal(answer);
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal));
      }
    };

    this.rpc.notifications.peerDisconnected = (peerId) => {
      this._cleanupPeer(peerId);
      this.emit('peerDisconnected', peerId);
    };
  }

  async createRoom(metadata = {}) {
    const result = await this.rpc.methods.createRoom(metadata);
    this.code = result.code;
    this.isHost = true;
    this.emit('roomCreated', this.code);
    return this.code;
  }

  async joinRoom(code, metadata = {}) {
    this.code = code;
    await this.rpc.methods.joinRoom(code, metadata);
    this.emit('waitingForApproval');
  }

  async approvePeer(peerId) {
    this.pendingPeers.delete(peerId);
    await this.rpc.methods.approvePeer(peerId);
    this._initiatePeerConnection(true, peerId);
  }

  async rejectPeer(peerId) {
    this.pendingPeers.delete(peerId);
    await this.rpc.methods.rejectPeer(peerId);
  }

  async _initiatePeerConnection(isInitiator, peerId = 'peer') {
    const pc = rtc.createPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.rpc.notifications.signal(event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      this.emit('connectionStateChange', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.emit('peerConnected', peerId);
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('data');
      this._setupDataChannel(dc, peerId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.rpc.notifications.signal(offer);
    } else {
      pc.ondatachannel = (event) => {
        this._setupDataChannel(event.channel, peerId);
      };
    }
  }

  _setupDataChannel(dc, peerId) {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      this.emit('dataChannelOpen', peerId);
    };

    dc.onmessage = (event) => {
      this.emit('message', event.data, peerId);
    };

    dc.onclose = () => {
      this.emit('dataChannelClose', peerId);
    };
  }

  send(data, peerId = 'peer') {
    const dc = this.dataChannels.get(peerId);
    if (dc && dc.readyState === 'open') {
      dc.send(data);
    }
  }

  _cleanupPeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.dataChannels.delete(peerId);
  }

  disconnect() {
    for (const [peerId] of this.peerConnections) {
      this._cleanupPeer(peerId);
    }
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default PeerSignalClient;
