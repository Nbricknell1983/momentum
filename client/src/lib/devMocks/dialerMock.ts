/**
 * Dialer mock — dev/test only.
 *
 * Replaces the Vapi/Twilio dialer in test environments.
 * connect() returns a fake callSid without making any network call.
 *
 * Usage:
 *   import { dialerMock } from '@/lib/devMocks/dialerMock';
 *   const { callSid } = await dialerMock.connect({ to, from });
 */

export type MockCallSession = {
  callSid: string;
  to: string;
  from: string;
  status: 'ringing' | 'in-progress' | 'completed' | 'failed';
  startedAt: number;
};

const _activeCalls = new Map<string, MockCallSession>();
let _callCounter = 0;

export const dialerMock = {
  enabled: !import.meta.env.PROD,

  connect(opts: { to: string; from?: string }): Promise<MockCallSession> {
    if (import.meta.env.PROD) throw new Error('dialerMock is not available in production');
    _callCounter++;
    const callSid = `mock-call-${_callCounter}`;
    const session: MockCallSession = {
      callSid,
      to: opts.to,
      from: opts.from ?? '+61200000000',
      status: 'ringing',
      startedAt: Date.now(),
    };
    _activeCalls.set(callSid, session);
    console.debug('[dialerMock] connect', session);
    // Simulate transition to in-progress after 500ms
    setTimeout(() => {
      const s = _activeCalls.get(callSid);
      if (s) s.status = 'in-progress';
    }, 500);
    return Promise.resolve(session);
  },

  hangup(callSid: string): Promise<void> {
    if (import.meta.env.PROD) throw new Error('dialerMock is not available in production');
    const session = _activeCalls.get(callSid);
    if (session) session.status = 'completed';
    console.debug('[dialerMock] hangup', callSid);
    return Promise.resolve();
  },

  getSession(callSid: string): MockCallSession | undefined {
    return _activeCalls.get(callSid);
  },

  reset() {
    _activeCalls.clear();
    _callCounter = 0;
  },
};
