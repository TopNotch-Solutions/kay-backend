require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { initSocket } = require('./socket');
const { sequelize } = require('./models');

const app = express();
// Behind nginx / load balancer (required for express-rate-limit with X-Forwarded-For)
app.set('trust proxy', 1);
const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);
app.set('io', io);

// Middleware
app.use(helmet());
app.use(compression());
const defaultDevOrigins = ['http://localhost:3000', 'http://localhost:5173', 'https://health.kopanovertex.com'];
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const corsOrigins = [...new Set([...defaultDevOrigins, ...configuredOrigins])];

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients; in dev allow listed SPA origins
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked origin: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting — auth routes use a stricter limiter in middleware/rateLimiter.js
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const auth = req.headers.authorization;
    return Boolean(auth && auth.startsWith('Bearer '));
  },
  message: { success: false, message: 'Too many requests. Please wait a moment and try again.' },
});
app.use('/api', limiter);

// Routes — Kay One: auth, front office, doctor, system admin (+ shared patient/queue/inventory/icd10/reports)
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/patients', require('./routes/patient.routes'));
app.use('/api/v1/front-office', require('./routes/frontOffice.routes'));
app.use('/api/v1/queue', require('./routes/queue.routes'));
app.use('/api/v1/consultations', require('./routes/doctor.routes'));
app.use('/api/v1/icd10', require('./routes/icd10.routes'));
app.use('/api/v1/inventory', require('./routes/inventory.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
app.use('/api/v1/reports', require('./routes/userReport.routes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

const { ensureRolesSynced } = require('./services/roleSyncService');
const { ensureUserReportsSchema } = require('./services/ensureUserReportsSchema');
const { ensureReportUploadDirs } = require('./utils/reportUploads');

ensureReportUploadDirs();

sequelize.authenticate()
  .then(() => {
    console.log('Database connected successfully');
    return ensureUserReportsSchema();
  })
  .then(() => {
    console.log('User reports schema ready');
    return ensureRolesSynced();
  })
  .then(() => {
    console.log('Roles synced from config');
  })
  .then(() => {
    // Schema changes belong in migrations (`npm run db:migrate`), not sync+alter.
    // alter:true can add duplicate indexes on every restart and hit MySQL's 64-index limit.
    const runAlterSync = process.env.SEQUELIZE_SYNC_ALTER === '1';
    if (runAlterSync) {
      console.warn('SEQUELIZE_SYNC_ALTER=1: running sequelize.sync({ alter: true }) — not recommended');
      return sequelize.sync({ alter: true });
    }
    // Schema is managed by migrations (`npm run db:migrate`). Do not alter on every startup.
    return Promise.resolve();
  })
  .then(() => {
    if (process.env.SEQUELIZE_SYNC_ALTER === '1') {
      console.log('Database tables synchronized (alter mode)');
    }
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      const {
        startClinicVisitExpiryScheduler,
        expireVisitsBeforeClinicDayGlobally,
        expireStaleClinicVisitsGlobally,
        closeStaleQueueEntriesBeforeClinicDay,
      } = require('./services/clinicVisitExpiryService');
      const { startFollowUpReminderScheduler } = require('./services/followUpReminderService');

      (async () => {
        try {
          const { Facility } = require('./models');
          const endOfDay = await expireVisitsBeforeClinicDayGlobally();
          const stale = await expireStaleClinicVisitsGlobally();
          const { Op } = require('sequelize');
          const clinics = await Facility.findAll({
            where: { type: { [Op.in]: ['clinic', 'health_center'] } },
            attributes: ['id'],
          });
          let queueClosed = 0;
          for (const clinic of clinics) {
            queueClosed += await closeStaleQueueEntriesBeforeClinicDay(clinic.id, 'doctor');
          }
          if (endOfDay > 0) {
            console.log(`Startup: closed ${endOfDay} in-progress visit(s) from before today`);
          }
          if (queueClosed > 0) {
            console.log(`Startup: removed ${queueClosed} stale doctor queue row(s) from before today`);
          }
          if (stale > 0) {
            console.log(`Startup: closed ${stale} visit(s) past the 24-hour window`);
          }
        } catch (err) {
          console.error('Startup visit cleanup error:', err.message);
        }
      })();

      startClinicVisitExpiryScheduler();
      startFollowUpReminderScheduler();
    });
  })
  .catch((err) => {
    console.error('Unable to connect to database:', err);
  });

module.exports = { app, server };
