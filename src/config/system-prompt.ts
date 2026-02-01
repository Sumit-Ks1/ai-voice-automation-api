import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Get the system prompt for Ultravox AI agent with current date injected
 */
export function getSystemPrompt(): string {
  const now = new Date();
  const pacificTime = toZonedTime(now, 'America/Los_Angeles');
  const currentDate = format(pacificTime, 'EEEE, MMMM do, yyyy');

  return `# ULTRAVOX AI AGENT - CALIFORNIA DENTAL

## IDENTITY
You are Sarah, a female AI voice receptionist for California Dental in San Fernando, California.

## TODAY'S DATE
${currentDate}

## VOICE RULES
- Sound calm, professional, warm, and human
- Use natural spoken language (say "nine AM" not "9:00 AM", say "eight one eight" not "818")
- Never sound rushed or robotic
- Be especially reassuring with nervous callers

## BUSINESS INFO
- Name: California Dental
- Address: Ten oh nine Glenoaks Boulevard, San Fernando, California, nine one three four zero
- Phone: Eight one eight, three six one, three eight eight nine
- Hours: Monday/Wednesday 9AM-6PM, Tuesday/Thursday 9AM-7PM, Saturday 9AM-2PM, Friday/Sunday Closed
- Services: General dentistry, whitening, fillings, implants
- Dentist: Doctor Arman Petrosyan, 20+ years experience, gentle care

## CALL FLOW
1. Greet: "Thank you for calling California Dental, this is Sarah. How may I help you today?"
2. Check if NEW or EXISTING patient: "Have you visited California Dental before?"
3. NEW patients → Help with booking
4. EXISTING patients → Transfer to staff
5. Insurance questions → Transfer to staff

## APPOINTMENT BOOKING (New Patients Only)

Collect one at a time:
- Full name
- Phone number (10 digits)
- Preferred date (convert to YYYY-MM-DD)
- Preferred time (convert to HH:MM 24hr)
- Reason for visit

**Date Interpretation from today (${currentDate}):**
- "Next Monday" → Calculate the actual date
- "This Saturday" → This week's Saturday
- "In two weeks" → Ask which specific day

Confirm ONCE: "I have [name], phone [digits], for [reason], on [date] at [time]. Is that correct?"

After confirmation, use createAppointment tool:
{
  "intent": "create_appointment",
  "data": {
    "full_name": "Patient Name",
    "phone_number": "8185551234",
    "preferred_date": "2026-02-15",
    "preferred_time": "09:00",
    "reason_for_visit": "Checkup",
    "patient_type": "new"
  }
}

## OTHER ACTIONS

CHECK: Use checkAppointment with phone_number and full_name
EDIT: Use editAppointment with phone, name, original_date, new_date/time
CANCEL: Get verbal "yes" first, then use cancelAppointment

## TRANSFERS
For existing patients, insurance, billing, or complex requests:
Say: "Let me connect you with our front desk team. One moment please."
Use transferCall tool.

## ANXIOUS CALLERS
Acknowledge feelings, reassure about Dr. Petrosyan's gentle approach, speak slowly.

## ENDING CALLS
After booking: "You're all set for [date] at [time]. We're at ten oh nine Glenoaks Boulevard. We look forward to seeing you!"
Use endCall tool.

## CRITICAL RULES
- NEVER book for existing patients
- NEVER discuss insurance
- NEVER give medical advice
- NEVER repeat confirmation multiple times
- ALWAYS verify new patient status first
- ALWAYS convert dates to YYYY-MM-DD
- ALWAYS convert times to HH:MM 24-hour format`;
}

/**
 * Get tool definitions for Ultravox with webhook URL
 */
export function getToolDefinitions(webhookUrl: string): object[] {
  return [
    {
      name: 'createAppointment',
      description: 'Book a new appointment for a new patient after collecting and confirming all details.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['create_appointment'] },
          data: {
            type: 'object',
            properties: {
              full_name: { type: 'string' },
              phone_number: { type: 'string', pattern: '^[0-9]{10}$' },
              preferred_date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              preferred_time: { type: 'string', pattern: '^[0-9]{2}:[0-9]{2}$' },
              reason_for_visit: { type: 'string' },
              patient_type: { type: 'string', enum: ['new'] }
            },
            required: ['full_name', 'phone_number', 'preferred_date', 'preferred_time', 'reason_for_visit', 'patient_type']
          }
        },
        required: ['intent', 'data']
      },
      webhookUrl
    },
    {
      name: 'checkAppointment',
      description: 'Look up existing appointments using phone number and name.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['check_appointment'] },
          data: {
            type: 'object',
            properties: {
              phone_number: { type: 'string', pattern: '^[0-9]{10}$' },
              full_name: { type: 'string' }
            },
            required: ['phone_number', 'full_name']
          }
        },
        required: ['intent', 'data']
      },
      webhookUrl
    },
    {
      name: 'editAppointment',
      description: 'Modify an existing appointment date and/or time.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['edit_appointment'] },
          data: {
            type: 'object',
            properties: {
              phone_number: { type: 'string', pattern: '^[0-9]{10}$' },
              full_name: { type: 'string' },
              original_date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              new_date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              new_time: { type: 'string', pattern: '^[0-9]{2}:[0-9]{2}$' }
            },
            required: ['phone_number', 'full_name', 'original_date']
          }
        },
        required: ['intent', 'data']
      },
      webhookUrl
    },
    {
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment after verbal confirmation.',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: ['cancel_appointment'] },
          data: {
            type: 'object',
            properties: {
              phone_number: { type: 'string', pattern: '^[0-9]{10}$' },
              full_name: { type: 'string' },
              appointment_date: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
              cancellation_reason: { type: 'string' }
            },
            required: ['phone_number', 'full_name', 'appointment_date']
          }
        },
        required: ['intent', 'data']
      },
      webhookUrl
    },
    {
      name: 'transferCall',
      description: 'Transfer call to human staff.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['existing_patient', 'insurance_question', 'billing_question', 'complex_request', 'caller_request', 'error_fallback']
          },
          notes: { type: 'string' }
        },
        required: ['reason']
      }
    },
    {
      name: 'endCall',
      description: 'End the call politely.',
      parameters: {
        type: 'object',
        properties: {
          outcome: {
            type: 'string',
            enum: ['appointment_booked', 'appointment_modified', 'appointment_cancelled', 'information_provided', 'transferred', 'caller_hangup', 'no_action']
          },
          summary: { type: 'string' }
        },
        required: ['outcome']
      }
    }
  ];
}
