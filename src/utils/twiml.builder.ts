/**
 * TwiML (Twilio Markup Language) response builder
 * Creates XML responses for Twilio voice calls
 */

/**
 * Build TwiML response for connecting call to Ultravox AI agent via WebSocket
 * @param streamUrl - WebSocket URL from Ultravox
 * @param callSid - Twilio Call SID for tracking
 */
export function buildStreamResponse(streamUrl: string, callSid: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
    </Stream>
  </Connect>
</Response>`;
}

/**
 * Build TwiML response for playing a message and hanging up
 * @param message - Message to speak
 */
export function buildSayResponse(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build TwiML response for error scenarios
 * @param errorMessage - User-friendly error message
 */
export function buildErrorResponse(errorMessage?: string): string {
  const message =
    errorMessage ||
    'We apologize, but we are experiencing technical difficulties. Please try again later or contact us directly.';

  return buildSayResponse(message);
}

/**
 * Build TwiML response for gathering user input
 * @param prompt - Prompt to play before gathering input
 * @param action - Callback URL for the gathered input
 * @param numDigits - Number of digits to gather
 * @param timeout - Timeout in seconds
 */
export function buildGatherResponse(
  prompt: string,
  action: string,
  numDigits: number = 1,
  timeout: number = 5
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="${numDigits}" action="${escapeXml(action)}" timeout="${timeout}" method="POST">
    <Say voice="Polly.Joanna">${escapeXml(prompt)}</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build TwiML response for call forwarding
 * @param phoneNumber - Phone number to forward to
 * @param timeout - Ring timeout in seconds
 */
export function buildDialResponse(phoneNumber: string, timeout: number = 30): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}">
    <Number>${escapeXml(phoneNumber)}</Number>
  </Dial>
  <Say voice="Polly.Joanna">The call could not be completed. Please try again later.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build TwiML response for recording a voicemail
 * @param action - Callback URL after recording
 * @param maxLength - Maximum recording length in seconds
 */
export function buildRecordResponse(action: string, maxLength: number = 120): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Please leave a message after the beep. Press any key when finished.</Say>
  <Record maxLength="${maxLength}" action="${escapeXml(action)}" method="POST" finishOnKey="*#" />
  <Say voice="Polly.Joanna">Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build TwiML response for pausing before next action
 * @param seconds - Number of seconds to pause
 * @param nextAction - TwiML to execute after pause
 */
export function buildPauseResponse(seconds: number, nextAction: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${seconds}"/>
  ${nextAction}
</Response>`;
}

/**
 * Escape XML special characters to prevent injection
 * @param unsafe - Unsafe string that may contain XML special chars
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate TwiML structure (basic validation)
 * @param twiml - TwiML string to validate
 */
export function isValidTwiML(twiml: string): boolean {
  // Check for basic XML structure
  if (!twiml.includes('<?xml') || !twiml.includes('<Response>')) {
    return false;
  }

  // Check for matching Response tags
  const openTags = (twiml.match(/<Response>/g) || []).length;
  const closeTags = (twiml.match(/<\/Response>/g) || []).length;

  return openTags === closeTags && openTags === 1;
}
