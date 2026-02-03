import { describe, it, expect, vi } from 'vitest';
import { PeerSignalClient, createClient } from './index.js';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true
  }))
}));

describe('PeerSignalClient', () => {
  it('should create client instance', () => {
    const client = new PeerSignalClient('http://localhost:3000');
    expect(client).toBeInstanceOf(PeerSignalClient);
    expect(client.serverUrl).toBe('http://localhost:3000');
  });

  it('should use createClient factory', () => {
    const client = createClient('http://localhost:3000', { name: 'Test' });
    expect(client).toBeInstanceOf(PeerSignalClient);
    expect(client.name).toBe('Test');
  });

  it('should default name to Anonymous', () => {
    const client = createClient('http://localhost:3000');
    expect(client.name).toBe('Anonymous');
  });

  it('should have default ICE servers', () => {
    const client = createClient('http://localhost:3000');
    expect(client.iceServers).toHaveLength(2);
    expect(client.iceServers[0].urls).toContain('stun.l.google.com');
  });

  it('should track peers in Map', () => {
    const client = createClient('http://localhost:3000');
    expect(client.peers).toBeInstanceOf(Map);
    expect(client.peers.size).toBe(0);
  });
});
