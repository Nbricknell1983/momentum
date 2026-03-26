// =============================================================================
// ERICA CALENDAR PROVIDER BOUNDARY
// =============================================================================
// Adapter abstraction for calendar integrations.
//
// ARCHITECTURE:
//   EricaCalendarAdapter (interface) ← GoogleCalendarAdapter | NullAdapter
//
// The NullAdapter is used when no provider is configured. It never fakes
// availability — it returns a clear, explicit provider-not-configured state.
//
// GOOGLE CALENDAR SETUP REQUIRED:
//   Replit Secrets:
//     GOOGLE_CALENDAR_CLIENT_ID      — OAuth2 client ID
//     GOOGLE_CALENDAR_CLIENT_SECRET  — OAuth2 client secret
//     GOOGLE_CALENDAR_REFRESH_TOKEN  — Long-lived refresh token (from OAuth consent)
//     GOOGLE_CALENDAR_CALENDAR_ID    — Calendar ID (email or "primary")
//
//   Setup steps:
//     1. Create a Google Cloud project
//     2. Enable the Google Calendar API
//     3. Create OAuth2 credentials (Web application)
//     4. Authorise at https://developers.google.com/oauthplayground
//        with scope: https://www.googleapis.com/auth/calendar
//     5. Exchange for a refresh token
//     6. Add all 4 secrets to Replit
// =============================================================================

import type {
  EricaBookingSlot,
  EricaBookingAvailabilityWindow,
  EricaConfirmedBooking,
  EricaBookingProviderState,
  EricaBookingFallbackReason,
} from './bookingTypes';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface EricaCalendarAdapter {
  name:               string;
  checkConfiguration(): EricaBookingProviderState;
  getAvailableSlots(window: EricaBookingAvailabilityWindow): Promise<EricaBookingSlot[]>;
  createCalendarEvent(booking: Omit<EricaConfirmedBooking, 'calendarEventId' | 'meetingLink'>): Promise<{ eventId: string; meetingLink?: string }>;
  updateCalendarEvent(eventId: string, updates: Partial<EricaConfirmedBooking>): Promise<void>;
  cancelCalendarEvent(eventId: string, reason?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Required secrets for Google Calendar
// ---------------------------------------------------------------------------

const GOOGLE_CAL_REQUIRED_SECRETS = [
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REFRESH_TOKEN',
  'GOOGLE_CALENDAR_CALENDAR_ID',
] as const;

function getMissingGoogleSecrets(): string[] {
  return GOOGLE_CAL_REQUIRED_SECRETS.filter(k => !process.env[k]);
}

// ---------------------------------------------------------------------------
// Null adapter — used when no provider is configured
// ---------------------------------------------------------------------------

class NullCalendarAdapter implements EricaCalendarAdapter {
  name = 'none';

  checkConfiguration(): EricaBookingProviderState {
    return {
      provider:             'none',
      configured:           false,
      missingSecrets:       GOOGLE_CAL_REQUIRED_SECRETS as unknown as string[],
      missingSetup: [
        'Set GOOGLE_CALENDAR_CLIENT_ID in Replit Secrets',
        'Set GOOGLE_CALENDAR_CLIENT_SECRET in Replit Secrets',
        'Set GOOGLE_CALENDAR_REFRESH_TOKEN in Replit Secrets (requires OAuth consent flow)',
        'Set GOOGLE_CALENDAR_CALENDAR_ID in Replit Secrets (use "primary" or your calendar email)',
        'Enable Google Calendar API in your Google Cloud project',
      ],
      canCheckAvailability: false,
      canCreateBookings:    false,
      lastCheckedAt:        new Date().toISOString(),
    };
  }

  async getAvailableSlots(): Promise<EricaBookingSlot[]> {
    throw new Error('Calendar provider not configured. Cannot check availability.');
  }

  async createCalendarEvent(): Promise<{ eventId: string; meetingLink?: string }> {
    throw new Error('Calendar provider not configured. Cannot create calendar events.');
  }

  async updateCalendarEvent(): Promise<void> {
    throw new Error('Calendar provider not configured.');
  }

  async cancelCalendarEvent(): Promise<void> {
    throw new Error('Calendar provider not configured.');
  }
}

// ---------------------------------------------------------------------------
// Google Calendar adapter
// ---------------------------------------------------------------------------

class GoogleCalendarAdapter implements EricaCalendarAdapter {
  name = 'google_calendar';

  private get clientId()      { return process.env.GOOGLE_CALENDAR_CLIENT_ID!; }
  private get clientSecret()  { return process.env.GOOGLE_CALENDAR_CLIENT_SECRET!; }
  private get refreshToken()  { return process.env.GOOGLE_CALENDAR_REFRESH_TOKEN!; }
  private get calendarId()    { return process.env.GOOGLE_CALENDAR_CALENDAR_ID!; }
  private get tokenEndpoint() { return 'https://oauth2.googleapis.com/token'; }
  private get calendarBase()  { return 'https://www.googleapis.com/calendar/v3'; }

  checkConfiguration(): EricaBookingProviderState {
    const missing = getMissingGoogleSecrets();
    return {
      provider:             'google_calendar',
      configured:           missing.length === 0,
      missingSecrets:       missing,
      missingSetup:         missing.length > 0 ? missing.map(k => `Set ${k} in Replit Secrets`) : [],
      canCheckAvailability: missing.length === 0,
      canCreateBookings:    missing.length === 0,
      lastCheckedAt:        new Date().toISOString(),
    };
  }

  // ── Get fresh OAuth2 access token using refresh token ────────────────────
  private async getAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type:    'refresh_token',
    });

    const resp = await fetch(this.tokenEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Google OAuth token refresh failed: ${err}`);
    }

    const data = await resp.json() as { access_token: string };
    return data.access_token;
  }

  // ── Fetch free/busy data from Google Calendar ─────────────────────────────
  async getAvailableSlots(window: EricaBookingAvailabilityWindow): Promise<EricaBookingSlot[]> {
    const token = await this.getAccessToken();

    const timeMin = new Date(`${window.fromDate}T00:00:00`).toISOString();
    const timeMax = new Date(`${window.toDate}T23:59:59`).toISOString();

    // Query free/busy
    const fbResp = await fetch(`${this.calendarBase}/freeBusy`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: window.timezone,
        items:    [{ id: this.calendarId }],
      }),
    });

    if (!fbResp.ok) {
      throw new Error(`Google Calendar free/busy query failed: ${await fbResp.text()}`);
    }

    const fbData = await fbResp.json() as {
      calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
    };

    const busyPeriods = fbData.calendars[this.calendarId]?.busy ?? [];

    // Generate candidate slots in the window, filtered against busy periods
    return generateAvailableSlots(window, busyPeriods);
  }

  // ── Create a calendar event ───────────────────────────────────────────────
  async createCalendarEvent(
    booking: Omit<EricaConfirmedBooking, 'calendarEventId' | 'meetingLink'>,
  ): Promise<{ eventId: string; meetingLink?: string }> {
    const token = await this.getAccessToken();

    const event: Record<string, any> = {
      summary:     `${booking.meetingPurpose} — ${booking.entityName}`,
      description: [
        `Erica booked appointment`,
        `Contact: ${booking.contactName ?? booking.entityName}`,
        `Business: ${booking.businessName}`,
        booking.callId ? `Call: ${booking.callId}` : null,
      ].filter(Boolean).join('\n'),
      start: { dateTime: booking.slot.startIso, timeZone: 'UTC' },
      end:   { dateTime: booking.slot.endIso,   timeZone: 'UTC' },
    };

    if (booking.contactEmail) {
      event.attendees = [{ email: booking.contactEmail }];
    }

    if (booking.format === 'google_meet') {
      event.conferenceData = {
        createRequest: { requestId: booking.bookingId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
      };
    }

    const params = booking.format === 'google_meet' ? '?conferenceDataVersion=1' : '';

    const resp = await fetch(`${this.calendarBase}/calendars/${encodeURIComponent(this.calendarId)}/events${params}`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!resp.ok) {
      throw new Error(`Google Calendar event creation failed: ${await resp.text()}`);
    }

    const data = await resp.json() as { id: string; conferenceData?: { entryPoints?: Array<{ uri: string; entryPointType: string }> } };

    const meetingLink = data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;

    return { eventId: data.id, meetingLink };
  }

  async updateCalendarEvent(eventId: string, updates: Partial<EricaConfirmedBooking>): Promise<void> {
    const token = await this.getAccessToken();
    const body: Record<string, any> = {};
    if (updates.slot) {
      body.start = { dateTime: updates.slot.startIso, timeZone: 'UTC' };
      body.end   = { dateTime: updates.slot.endIso,   timeZone: 'UTC' };
    }
    const resp = await fetch(
      `${this.calendarBase}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      },
    );
    if (!resp.ok) throw new Error(`Google Calendar event update failed: ${await resp.text()}`);
  }

  async cancelCalendarEvent(eventId: string, reason?: string): Promise<void> {
    const token = await this.getAccessToken();
    const resp = await fetch(
      `${this.calendarBase}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!resp.ok && resp.status !== 410) {
      throw new Error(`Google Calendar event cancellation failed: ${await resp.text()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Slot generation — carve available windows from free/busy data
// ---------------------------------------------------------------------------

function generateAvailableSlots(
  window:      EricaBookingAvailabilityWindow,
  busyPeriods: Array<{ start: string; end: string }>,
): EricaBookingSlot[] {
  const slots: EricaBookingSlot[] = [];
  const durationMs = window.durationMinutes * 60_000;

  // Generate days
  const from = new Date(`${window.fromDate}T00:00:00Z`);
  const to   = new Date(`${window.toDate}T23:59:59Z`);

  const busyRanges = busyPeriods.map(b => ({
    start: new Date(b.start).getTime(),
    end:   new Date(b.end).getTime(),
  }));

  const isOverlapping = (slotStart: number, slotEnd: number) =>
    busyRanges.some(b => slotStart < b.end && slotEnd > b.start);

  // Walk each day, generate slots at 30-min intervals in the preferred window
  const current = new Date(from);
  while (current <= to) {
    const dayStr = current.toISOString().slice(0, 10);

    // Define morning / afternoon blocks (UTC — offset for AU timezone is applied via label)
    const blocks = window.preference === 'morning'   ? [{ h: 22, m: 0 }, { h: 0, m: 30 }]   // 8–10am AEST
                 : window.preference === 'afternoon'  ? [{ h: 2, m: 0 }, { h: 4, m: 30 }]    // noon–2pm AEST
                 : [{ h: 22, m: 0 }, { h: 23, m: 0 }, { h: 0, m: 0 }, { h: 1, m: 0 }, { h: 2, m: 0 }, { h: 3, m: 0 }];

    for (const block of blocks) {
      // Apply to prev day for AEST morning (UTC-10 offset)
      const slotDate = block.h >= 20 ? dayStr : current.toISOString().slice(0, 10);
      const slotStartStr = `${slotDate}T${String(block.h).padStart(2, '0')}:${String(block.m).padStart(2, '0')}:00Z`;
      const slotStart = new Date(slotStartStr).getTime();
      const slotEnd   = slotStart + durationMs;

      if (isNaN(slotStart)) continue;
      if (!isOverlapping(slotStart, slotEnd)) {
        const startDt = new Date(slotStart);
        const endDt   = new Date(slotEnd);

        const slotId = `slot_${slotStart}`;
        if (slots.some(s => s.slotId === slotId)) continue;

        slots.push({
          slotId,
          windowId:   window.windowId,
          startIso:   startDt.toISOString(),
          endIso:     endDt.toISOString(),
          startLocal: formatLocalTime(startDt, window.timezone),
          endLocal:   formatLocalTime(endDt, window.timezone),
          dateLabel:  formatDateLabel(startDt, window.timezone),
          timeLabel:  `${formatLocalTime(startDt, window.timezone)} – ${formatLocalTime(endDt, window.timezone)} ${tzAbbr(window.timezone)}`,
          available:  true,
          source:     'google_calendar',
        });
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
    if (slots.length >= 6) break;   // Offer max 6 slots
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Timezone formatting helpers
// ---------------------------------------------------------------------------

function formatLocalTime(dt: Date, tz: string): string {
  try {
    return dt.toLocaleTimeString('en-AU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return dt.toISOString().slice(11, 16);
  }
}

function formatDateLabel(dt: Date, tz: string): string {
  try {
    return dt.toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return dt.toISOString().slice(0, 10);
  }
}

function tzAbbr(tz: string): string {
  const abbrs: Record<string, string> = {
    'Australia/Sydney':    'AEST',
    'Australia/Melbourne': 'AEST',
    'Australia/Brisbane':  'AEST',
    'Australia/Perth':     'AWST',
    'Australia/Adelaide':  'ACST',
    'America/New_York':    'ET',
    'America/Los_Angeles': 'PT',
    'Europe/London':       'GMT',
  };
  return abbrs[tz] ?? 'UTC';
}

// ---------------------------------------------------------------------------
// Provider resolver — returns the correct adapter for the current config
// ---------------------------------------------------------------------------

function resolveProvider(): EricaCalendarAdapter {
  const missing = getMissingGoogleSecrets();
  if (missing.length === 0) return new GoogleCalendarAdapter();
  return new NullCalendarAdapter();
}

// ---------------------------------------------------------------------------
// Public API — singleton provider accessor
// ---------------------------------------------------------------------------

export function getCalendarAdapter(): EricaCalendarAdapter {
  return resolveProvider();
}

export function getProviderState(): EricaBookingProviderState {
  return resolveProvider().checkConfiguration();
}

export function isCalendarConfigured(): boolean {
  return getMissingGoogleSecrets().length === 0;
}
