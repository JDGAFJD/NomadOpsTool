export type CallVerificationMode = 'csv' | 'twilio' | 'disabled';

export function getCallVerificationMode(): CallVerificationMode {
  const configured = process.env.CALL_VERIFICATION_MODE?.trim().toLowerCase();
  if (configured === 'twilio' || configured === 'disabled' || configured === 'csv') return configured;
  return 'csv';
}

export function isCallVerificationEnabled() {
  return getCallVerificationMode() !== 'disabled';
}

export function isCsvCallVerificationMode() {
  return getCallVerificationMode() === 'csv';
}

export function isTwilioCallVerificationMode() {
  return getCallVerificationMode() === 'twilio'
    && process.env.TWILIO_CALL_VERIFICATION_ENABLED === 'true';
}
