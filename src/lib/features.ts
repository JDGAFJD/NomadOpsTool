export function isCallVerificationEnabled() {
  return process.env.TWILIO_CALL_VERIFICATION_ENABLED === 'true';
}
