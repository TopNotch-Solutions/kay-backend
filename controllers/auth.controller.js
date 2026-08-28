const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, Role, RefreshToken, AuditLog, Facility } = require('../models');
const { success, error } = require('../utils/response');
const { displayKayOneFacilityName } = require('../utils/kayOneFacilityResolver');
const {
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
} = require('../services/forgotPasswordService');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role.name, facilityId: user.facility_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, 'Email and password are required', 400);
    }

    const user = await User.findOne({
      where: { email },
      include: [
        { model: Role, as: 'role' },
        { model: Facility, as: 'facility', attributes: ['id', 'name', 'type'] },
      ],
    });

    if (!user) {
      return error(res, 'Invalid credentials', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return error(res, 'Invalid credentials', 401);
    }

    if (!user.is_active) {
      return error(
        res,
        'Your account has been deactivated. Contact your system administrator.',
        403
      );
    }

    const tokens = generateTokens(user);

    // Store refresh token
    await RefreshToken.create({
      id: uuidv4(),
      user_id: user.id,
      token: tokens.refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Update last login
    await user.update({ last_login: new Date() });

    // Audit log
    await AuditLog.create({
      user_id: user.id,
      action: 'login',
      resource: 'auth',
      ip_address: req.ip,
    });

    return success(res, {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role.name,
        role_display: user.role.display_name,
        facility_id: user.facility_id,
        facility_name: displayKayOneFacilityName(user.facility?.name),
        facility_type: user.facility?.type || null,
        must_change_password: Boolean(user.must_change_password),
      },
      ...tokens,
    }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return error(res, 'Server error', 500);
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return error(res, 'Refresh token required', 400);
    }

    const storedToken = await RefreshToken.findOne({
      where: { token: refreshToken, revoked: false },
    });

    if (!storedToken || new Date() > storedToken.expires_at) {
      return error(res, 'Invalid or expired refresh token', 401);
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      include: [{ model: Role, as: 'role' }],
    });

    if (!user) {
      return error(res, 'Invalid or expired refresh token', 401);
    }

    if (!user.is_active) {
      await storedToken.update({ revoked: true });
      return error(
        res,
        'Your account has been deactivated. Contact your system administrator.',
        403
      );
    }

    // Revoke old token and issue new ones
    await storedToken.update({ revoked: true });
    const tokens = generateTokens(user);

    await RefreshToken.create({
      id: uuidv4(),
      user_id: user.id,
      token: tokens.refreshToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return success(res, tokens, 'Token refreshed');
  } catch (err) {
    return error(res, 'Invalid token', 401);
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.update({ revoked: true }, { where: { token: refreshToken } });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'logout',
      resource: 'auth',
      ip_address: req.ip,
    });

    return success(res, null, 'Logged out successfully');
  } catch (err) {
    return error(res, 'Server error', 500);
  }
};

exports.me = async (req, res) => {
  const user = req.user;
  return success(res, {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    role: user.role.name,
    role_display: user.role.display_name,
    facility_id: user.facility_id,
    must_change_password: Boolean(user.must_change_password),
  });
};

/**
 * Set a new password (used after first login with a temporary password).
 */
exports.setPassword = async (req, res) => {
  try {
    const { new_password, confirm_password } = req.body;
    const next = String(new_password || '');
    const confirm = String(confirm_password || '');

    if (!next || !confirm) {
      return error(res, 'Password and confirm password are required', 400);
    }
    if (next !== confirm) {
      return error(res, 'Password and confirm password do not match', 400);
    }
    if (next.length < 8) {
      return error(res, 'Password must be at least 8 characters', 400);
    }

    const sameAsCurrent = await bcrypt.compare(next, req.user.password_hash);
    if (sameAsCurrent) {
      return error(res, 'New password cannot be the same as your current password', 400);
    }

    const password_hash = await bcrypt.hash(next, 10);
    await User.update(
      { password_hash, must_change_password: false },
      { where: { id: req.user.id } }
    );

    await AuditLog.create({
      user_id: req.user.id,
      action: 'password_change',
      resource: 'auth',
      ip_address: req.ip,
    });

    return success(res, { must_change_password: false }, 'Password updated successfully');
  } catch (err) {
    console.error('Set password error:', err);
    return error(res, 'Failed to update password', 500);
  }
};

exports.forgotPasswordRequest = async (req, res) => {
  try {
    const { phone, cellphone, cell_phone } = req.body;
    const result = await requestForgotPasswordOtp(phone || cellphone || cell_phone);
    return success(res, result, result.message);
  } catch (err) {
    console.error('Forgot password request error:', err);
    return error(res, err.message || 'Failed to send OTP', err.statusCode || 500);
  }
};

exports.forgotPasswordReset = async (req, res) => {
  try {
    const {
      phone,
      cellphone,
      cell_phone,
      otp,
      new_password,
      confirm_password,
    } = req.body;

    const result = await resetPasswordWithOtp({
      phone: phone || cellphone || cell_phone,
      otp,
      new_password,
      confirm_password,
    });

    const user = await User.findOne({ where: { email: result.email } });
    if (user) {
      await AuditLog.create({
        user_id: user.id,
        action: 'forgot_password_reset',
        resource: 'auth',
        ip_address: req.ip,
      });
    }

    return success(res, { email: result.email }, result.message);
  } catch (err) {
    console.error('Forgot password reset error:', err);
    return error(res, err.message || 'Failed to reset password', err.statusCode || 500);
  }
};
