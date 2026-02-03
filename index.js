import { io } from 'socket.io-client';
import rawr from 'rawr';
import { EventEmitter } from 'events';

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
    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.name = options.name || 'Anonymous';
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, this.options.socketOptions || {});

      this.socket.on('connect', () => {
        this._setupRPC();
        this.emit('connected');
        resolve();
      });

      this.socket.on('disconnect', () => {
        this.emit('disconnected');
      });

      this.socket.on('connect_error', (err) => {
        reject(err);
      });

      // Server-initiated events
      this.socket.on('peer:request', ({ peerId, name }) => {
        this.emit('peer:request', { peerId, name });
      });

      this.socket.on('peer:approved', ({ hostId }) => {
        this.emit('peer:approved', { hostId });
      });

      this.socket.on('peer:denied', () => {
        this.emit('peer:denied');
      });

      this.socket.on('peer:disconnected', ({ peerId }) => {
        this._cleanupPeer(peerId);
        this.emit('peer:disconnected', { peerId });
      });

      this.socket.on('host:disconnected', () => {
        this.emit('host:disconnected');
      });

      this.socket.on('host:reconnected', ({ hostId }) => {
        this.emit('host:reconnected', { hostId });
      });

      this.socket.on('signal', ({ from, payload }) => {
        this._handleSignal(from, payload);
      });
    });
  }

  _setupRPC() {
    const transport = new EventEmitter();
    transport.send = (msg) => {
      this.socket.emit('rpc', typeof msg === 'string' ? msg : JSON.stringify(msg));
    };

    this.rpc = rawr({ transport, timeout: 10000 });

    this.socket.on('rpc', (msg) => {
      try {
        const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
        transport.emit('rpc', data);
      } catch (e) {
        console.error('[rpc] parse error:', e);
      }
    });
  }

  async createRoom() {
    const result = await this.rpc.methods.createRoom();
    if (result.code) {
      this.code = result.code;
      this.isHost = true;
      this.iceServers = result.iceServers || this.iceServers;
    }
    return result;
  }

  async joinRoom(code, name) {
    const result = await this.rpc.methods.joinRoom({ code, name: name || this.name });
    if (result.success) {
      this.code = code.toLowerCase();
      this.isHost = false;
      this.iceServers = result.iceServers || this.iceServers;
    }
    return result;
  }

  async approvePeer(peerId, approved = true) {
    const result = await this.rpc.methods.approvePeer({ peerId, approved });
    if (result.success && approved) {
      // Start WebRTC connection as host (offerer)
      await this._createPeerConnection(peerId, true);
    }
    return result;
  }

  async _createPeerConnection(peerId, isOfferer) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, pc);

    // Data channel
    let dataChannel;
    if (isOfferer) {
      dataChannel = pc.createDataChannel('data');
      this._setupDataChannel(dataChannel, peerId);
    } else {
      pc.ondatachannel = (event) => {
        dataChannel = event.channel;
        this._setupDataChannel(dataChannel, peerId);
      };
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.rpc.methods.signal({
          to: peerId,
          payload: { type: 'candidate', candidate: event.candidate }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.emit('peer:connectionstate', { peerId, state: pc.connectionState });
      if (pc.connectionState === 'connected') {
        this.emit('peer:connected', { peerId });
      }
    };

    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.rpc.methods.signal({
        to: peerId,
        payload: { type: 'offer', sdp: offer.sdp }
      });
    }

    return pc;
  }

  _setupDataChannel(channel, peerId) {
    channel.onopen = () => {
      this.emit('datachannel:open', { peerId, channel });
    };

    channel.onclose = () => {
      this.emit('datachannel:close', { peerId });
    };

    channel.onmessage = (event) => {
      this.emit('datachannel:message', { peerId, data: event.data });
    };

    // Store reference
    const pc = this.peers.get(peerId);
    if (pc) pc.dataChannel = channel;
  }

  async _handleSignal(from, payload) {
    let pc = this.peers.get(from);

    if (payload.type === 'offer') {
      // Create peer connection if not exists
      if (!pc) {
        pc = await this._createPeerConnection(from, false);
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.rpc.methods.signal({
        to: from,
        payload: { type: 'answer', sdp: answer.sdp }
      });
    } else if (payload.type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      }
    } else if (payload.type === 'candidate') {
      if (pc) {
        await pc.addIceCandidate(payload.candidate);
      }
    }
  }

  _cleanupPeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
  }

  send(peerId, data) {
    const pc = this.peers.get(peerId);
    if (pc && pc.dataChannel && pc.dataChannel.readyState === 'open') {
      pc.dataChannel.send(data);
      return true;
    }
    return false;
  }

  broadcast(data) {
    for (const [_peerId, pc] of this.peers) {
      if (pc.dataChannel && pc.dataChannel.readyState === 'open') {
        pc.dataChannel.send(data);
      }
    }
  }

  disconnect() {
    for (const [peerId] of this.peers) {
      this._cleanupPeer(peerId);
    }
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export function createClient(serverUrl, options = {}) {
  return new PeerSignalClient(serverUrl, options);
}

// Browser global
if (typeof window !== 'undefined') {
  window.PeerSignal = { PeerSignalClient, createClient };
}
