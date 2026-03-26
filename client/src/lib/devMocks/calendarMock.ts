/**
 * Calendar mock provider — dev/test only.
 *
 * Replaces the real Google Calendar adapter in test environments.
 * createEvent() returns a deterministic id/start/end without any network call.
 *
 * Usage:
 *   import { calendarMock } from '@/lib/devMocks/calendarMock';
 *   const event = await calendarMock.createEvent({ title, start, end });
 */

export type MockCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
};

let _eventCounter = 0;

export const calendarMock = {
  enabled: !import.meta.env.PROD,

  createEvent(opts: { title: string; start: string; end: string; attendees?: string[] }): Promise<MockCalendarEvent> {
    if (import.meta.env.PROD) throw new Error('calendarMock is not available in production');
    _eventCounter++;
    const event: MockCalendarEvent = {
      id: `mock-cal-event-${_eventCounter}`,
      title: opts.title,
      start: opts.start,
      end: opts.end,
      attendees: opts.attendees ?? [],
    };
    console.debug('[calendarMock] createEvent', event);
    return Promise.resolve(event);
  },

  updateEvent(id: string, updates: Partial<MockCalendarEvent>): Promise<MockCalendarEvent> {
    if (import.meta.env.PROD) throw new Error('calendarMock is not available in production');
    const event: MockCalendarEvent = { id, title: '', start: '', end: '', ...updates };
    console.debug('[calendarMock] updateEvent', event);
    return Promise.resolve(event);
  },

  deleteEvent(id: string): Promise<void> {
    if (import.meta.env.PROD) throw new Error('calendarMock is not available in production');
    console.debug('[calendarMock] deleteEvent', id);
    return Promise.resolve();
  },

  reset() {
    _eventCounter = 0;
  },
};
