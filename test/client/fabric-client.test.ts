import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FabricClient } from '../../src/client/fabric-client';
import { EventService } from '../../src/events/event-service';
import type { AppIdentity, BlockEventParams, ChaincodeEventParams, FabricClientConfig } from '../../src/models';

// --- Mocking Setup ---
// We create explicit spies (mock functions) for the methods we want to test.
const mockListenToChaincodeEvents = vi.fn();
const mockListenToBlockEvents = vi.fn();

// We mock the entire EventService module with a factory function.
// This gives us full control over the mocked class and its instances.
vi.mock('../../src/events/event-service', () => {
  // The factory returns an object that defines the exports of the mocked module.
  return {
    // EventService is now a mock constructor.
    EventService: vi.fn().mockImplementation(() => {
      // The implementation of the constructor returns an object
      // representing an instance of EventService.
      return {
        listenToChaincodeEvents: mockListenToChaincodeEvents,
        listenToBlockEvents: mockListenToBlockEvents,
      };
    }),
  };
});

// --- Test Suite ---
describe('FabricClient', () => {
  const mockConfig: FabricClientConfig = {
    gatewayUrl: 'http://localhost:7051',
    wsUrl: 'ws://localhost:7052',
  };

  const mockIdentity: AppIdentity = {
    cert: 'mock-cert',
    sign: async () => new Uint8Array(),
  };

  const mockAbortSignal = new AbortController().signal;

  // Before each test, we clear the state of our mocks to ensure test isolation.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should instantiate EventService upon creation', () => {
    new FabricClient(mockConfig);
    // We still check if the (mocked) constructor was called.
    expect(EventService).toHaveBeenCalledOnce();
    expect(EventService).toHaveBeenCalledWith(mockConfig);
  });

  it('should delegate listenToChaincodeEvents calls to the spy function', () => {
    const client = new FabricClient(mockConfig);
    const mockParams: ChaincodeEventParams = { mspId: 'msp1', channelName: 'ch1', chaincodeName: 'cc1' };

    client.listenToChaincodeEvents(mockParams, mockIdentity, mockAbortSignal);

    // Now we assert against our explicit spy, not the instance method.
    expect(mockListenToChaincodeEvents).toHaveBeenCalledOnce();
    expect(mockListenToChaincodeEvents).toHaveBeenCalledWith(
      mockParams,
      mockIdentity,
      mockAbortSignal,
    );
  });

  it('should delegate listenToBlockEvents calls to the spy function', () => {
    const client = new FabricClient(mockConfig);
    const mockParams: BlockEventParams = { mspId: 'msp1', channelName: 'ch1', targetPeer: 'peer0', targetHostname: 'peer0.org1.example.com' };

    client.listenToBlockEvents(mockParams, mockIdentity, mockAbortSignal);

    // Assert against our explicit spy.
    expect(mockListenToBlockEvents).toHaveBeenCalledOnce();
    expect(mockListenToBlockEvents).toHaveBeenCalledWith(
      mockParams,
      mockIdentity,
      mockAbortSignal,
    );
  });
});