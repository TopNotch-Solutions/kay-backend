'use strict';

const crypto = require('crypto');
const callExternalApi = require('../utils/connectSMS');

/** phone -> { code, expiresAt, attempts } */
const otpStore = new Map();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').trim();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * Create and store a consent OTP, then deliver it via ConnectSMS (callExternalApi).
 */
async function sendConsentOtp(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    const err = new Error('A cell phone number is required to send the OTP.');
    err.statusCode = 400;
    throw err;
  }

  const code = generateOtp();
  otpStore.set(normalized, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });

  const message = `Kay-One Dental: Your consent OTP is ${code}. It expires in 10 minutes. Do not share this code.`;

  try {
    await callExternalApi(normalized, message);
  } catch (err) {
    otpStore.delete(normalized);
    const sendErr = new Error(err.message || 'Failed to send OTP SMS.');
    sendErr.statusCode = 502;
    throw sendErr;
  }

  return {
    phone: normalized,
    expires_in_seconds: Math.floor(OTP_TTL_MS / 1000),
    message: `OTP sent to ${normalized}`,
  };
}

function verifyConsentOtp(phone, otp) {
  const normalized = normalizePhone(phone);
  const code = String(otp || '').trim();
  if (!normalized || !code) {
    const err = new Error('Phone number and OTP are required.');
    err.statusCode = 400;
    throw err;
  }

  const entry = otpStore.get(normalized);
  if (!entry) {
    const err = new Error('No OTP was sent for this number. Send an OTP first.');
    err.statusCode = 400;
    throw err;
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalized);
    const err = new Error('OTP has expired. Please send a new one.');
    err.statusCode = 400;
    throw err;
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    otpStore.delete(normalized);
    const err = new Error('Too many incorrect OTP attempts. Please send a new one.');
    err.statusCode = 400;
    throw err;
  }
  if (entry.code !== code) {
    const err = new Error('Incorrect OTP. Please try again.');
    err.statusCode = 400;
    throw err;
  }

  otpStore.delete(normalized);
  return { verified: true, phone: normalized };
}

module.exports = {
  sendConsentOtp,
  verifyConsentOtp,
  normalizePhone,
};
