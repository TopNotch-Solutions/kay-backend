'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const callExternalApi = require('../utils/connectSMS');
const { normalizePhone } = require('./consentOtpService');
const { User } = require('../models');

/** phone -> { code, expiresAt, verified } */
const otpStore = new Map();

/** `${phone}|${day}` -> { sends, fails } */
const dailyStore = new Map();

const OTP_TTL_MS = 10 * 60 * 1000;
const DAILY_MAX_CHANCES = 3;

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Windhoek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dailyBucket(phone) {
  const key = `${phone}|${todayKey()}`;
  let row = dailyStore.get(key);
  if (!row) {
    row = { sends: 0, fails: 0 };
    dailyStore.set(key, row);
  }
  return row;
}

function assertDailyChancesAvailable(phone) {
  const row = dailyBucket(phone);
  if (row.fails >= DAILY_MAX_CHANCES) {
    const err = new Error(
      'You have used all 3 password-reset chances for today. Try again tomorrow or contact your administrator.'
    );
    err.statusCode = 429;
    throw err;
  }
  if (row.sends >= DAILY_MAX_CHANCES) {
    const err = new Error(
      'You have reached the daily limit of 3 OTP requests. Try again tomorrow or contact your administrator.'
    );
    err.statusCode = 429;
    throw err;
  }
}

function recordDailyFail(phone) {
  const row = dailyBucket(phone);
  row.fails += 1;
  return DAILY_MAX_CHANCES - row.fails;
}

function phoneDigits(value) {
  return normalizePhone(value).replace(/\D/g, '');
}

async function findUserByCellphone(phone) {
  const normalized = normalizePhone(phone);
  const digits = phoneDigits(normalized);
  if (!digits || digits.length < 7) return null;

  const users = await User.findAll({
    where: {
      phone: { [Op.ne]: null },
      is_active: true,
    },
    attributes: ['id', 'phone', 'password_hash', 'first_name', 'email', 'must_change_password'],
  });

  return (
    users.find((u) => {
      const p = phoneDigits(u.phone);
      if (!p) return false;
      if (p === digits) return true;
      if (digits.length >= 9 && p.endsWith(digits.slice(-9))) return true;
      if (p.length >= 9 && digits.endsWith(p.slice(-9))) return true;
      return false;
    }) || null
  );
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * If an active employee exists for this cellphone, send a reset OTP via SMS.
 */
async function requestForgotPasswordOtp(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    const err = new Error('Cellphone number is required.');
    err.statusCode = 400;
    throw err;
  }

  assertDailyChancesAvailable(normalized);

  const user = await findUserByCellphone(normalized);
  if (!user) {
    const err = new Error('No active account was found for this cellphone number.');
    err.statusCode = 404;
    throw err;
  }

  const code = generateOtp();
  otpStore.set(normalized, {
    code,
    userId: user.id,
    expiresAt: Date.now() + OTP_TTL_MS,
    verified: false,
  });

  const message = `Kay-One Dental: Your password reset OTP is ${code}. It expires in 10 minutes. Do not share this code.`;

  try {
    await callExternalApi(normalized, message);
  } catch (err) {
    otpStore.delete(normalized);
    const sendErr = new Error(err.message || 'Failed to send OTP SMS.');
    sendErr.statusCode = 502;
    throw sendErr;
  }

  const row = dailyBucket(normalized);
  row.sends += 1;

  return {
    phone: normalized,
    expires_in_seconds: Math.floor(OTP_TTL_MS / 1000),
    chances_remaining: DAILY_MAX_CHANCES - row.fails,
    otp_requests_remaining: DAILY_MAX_CHANCES - row.sends,
    message: `OTP sent to ${normalized}`,
  };
}

/**
 * Verify OTP and set a new password (min 8 chars, must differ from current).
 */
async function resetPasswordWithOtp({
  phone,
  otp,
  new_password,
  confirm_password,
}) {
  const normalized = normalizePhone(phone);
  const code = String(otp || '').trim();
  const next = String(new_password || '');
  const confirm = String(confirm_password || '');

  if (!normalized || !code) {
    const err = new Error('Cellphone number and OTP are required.');
    err.statusCode = 400;
    throw err;
  }

  assertDailyChancesAvailable(normalized);

  if (!next || !confirm) {
    const err = new Error('Password and confirm password are required.');
    err.statusCode = 400;
    throw err;
  }
  if (next !== confirm) {
    const err = new Error('Password and confirm password do not match.');
    err.statusCode = 400;
    throw err;
  }
  if (next.length < 8) {
    const err = new Error('Password must be at least 8 characters.');
    err.statusCode = 400;
    throw err;
  }

  const entry = otpStore.get(normalized);
  if (!entry) {
    const err = new Error('No OTP was sent for this number. Request a new OTP first.');
    err.statusCode = 400;
    throw err;
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalized);
    const err = new Error('OTP has expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  if (entry.code !== code) {
    const remaining = recordDailyFail(normalized);
    const err = new Error(
      remaining > 0
        ? `Incorrect OTP. You have ${remaining} chance(s) left today.`
        : 'Incorrect OTP. You have used all 3 chances for today.'
    );
    err.statusCode = remaining > 0 ? 400 : 429;
    throw err;
  }

  const user = await User.findByPk(entry.userId);
  if (!user || !user.is_active) {
    otpStore.delete(normalized);
    const err = new Error('Account not found or inactive.');
    err.statusCode = 404;
    throw err;
  }

  const sameAsCurrent = await bcrypt.compare(next, user.password_hash);
  if (sameAsCurrent) {
    const remaining = recordDailyFail(normalized);
    const err = new Error(
      remaining > 0
        ? `New password cannot be the same as your current password. You have ${remaining} chance(s) left today.`
        : 'New password cannot be the same as your current password. You have used all 3 chances for today.'
    );
    err.statusCode = remaining > 0 ? 400 : 429;
    throw err;
  }

  const password_hash = await bcrypt.hash(next, 10);
  await user.update({
    password_hash,
    must_change_password: false,
  });

  otpStore.delete(normalized);

  return {
    email: user.email,
    message: 'Password updated successfully. You can sign in with your new password.',
  };
}

module.exports = {
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  findUserByCellphone,
  DAILY_MAX_CHANCES,
};
