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
    this.peers = new Map(); // peerId -> { pc, pendingCandidates, hasRemoteDescription }
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
    
    // Store peer state with candidate buffer
    const peerState = {
      pc,
      pendingCandidates: [],
      hasRemoteDescription: false
    };
    this.peers.set(peerId, peerState);

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

    // Trickle ICE - send candidates in realtime as discovered
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

    return peerState;
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
    const peerState = this.peers.get(peerId);
    if (peerState) peerState.dataChannel = channel;
  }

  async _handleSignal(from, payload) {
    let peerState = this.peers.get(from);

    if (payload.type === 'offer') {
      // Create peer connection if not exists
      if (!peerState) {
        peerState = await this._createPeerConnection(from, false);
      }
      
      const { pc, pendingCandidates } = peerState;
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      peerState.hasRemoteDescription = true;
      
      // Flush any buffered candidates
      if (pendingCandidates.length > 0) {
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.warn('Error adding buffered candidate:', e);
          }
        }
        pendingCandidates.length = 0;
      }
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.rpc.methods.signal({
        to: from,
        payload: { type: 'answer', sdp: answer.sdp }
      });
      
    } else if (payload.type === 'answer') {
      if (peerState) {
        const { pc, pendingCandidates } = peerState;
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        peerState.hasRemoteDescription = true;
        
        // Flush any buffered candidates
        if (pendingCandidates.length > 0) {
          for (const candidate of pendingCandidates) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.warn('Error adding buffered candidate:', e);
            }
          }
          pendingCandidates.length = 0;
        }
      }
      
    } else if (payload.type === 'candidate') {
      if (!peerState) {
        // Peer connection doesn't exist yet - this shouldn't happen but buffer just in case
        console.warn('Received candidate before peer connection exists, buffering');
        // Create a temporary buffer that will be picked up when connection is created
        this._earlyCandidate = this._earlyCandidate || new Map();
        if (!this._earlyCandidate.has(from)) {
          this._earlyCandidate.set(from, []);
        }
        this._earlyCandidate.get(from).push(payload.candidate);
        return;
      }
      
      const { pc, pendingCandidates, hasRemoteDescription } = peerState;
      
      if (!hasRemoteDescription) {
        // Buffer candidates until we have remote description
        pendingCandidates.push(payload.candidate);
      } else {
        // Apply immediately
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (e) {
          console.warn('Error adding ICE candidate:', e);
        }
      }
    }
  }

  _cleanupPeer(peerId) {
    const peerState = this.peers.get(peerId);
    if (peerState) {
      peerState.pc.close();
      this.peers.delete(peerId);
    }
  }

  send(peerId, data) {
    const peerState = this.peers.get(peerId);
    if (peerState && peerState.dataChannel && peerState.dataChannel.readyState === 'open') {
      peerState.dataChannel.send(data);
      return true;
    }
    return false;
  }

  broadcast(data) {
    for (const [_peerId, peerState] of this.peers) {
      if (peerState.dataChannel && peerState.dataChannel.readyState === 'open') {
        peerState.dataChannel.send(data);
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
