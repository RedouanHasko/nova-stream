const { init, getDb } = require("./connection");
const helpers = require("./helpers");
const {
  createUserRepository,
  createResellerRepository,
} = require("./repositories/accounts.repository");
const {
  createPricingPlanRepository,
  createApiIntegrationRepository,
  createSystemSettingRepository,
  createApplicationRepository,
} = require("./repositories/catalog.repository");
const {
  createPlaylistRepository,
  createDevicePlaylistRepository,
  createDeviceRepository,
  createActivatedAppRepository,
} = require("./repositories/content.repository");
const {
  createParentChangeRequestRepository,
  createPhoneVerificationCodeRepository,
  createNotificationRepository,
  createCreditTransactionRepository,
} = require("./repositories/operations.repository");

// Serialization lock — ensures only one $transaction runs at a time on the
// in-process sql.js database.  This prevents a second request from issuing
// BEGIN IMMEDIATE while the first transaction is still in-flight.
let _txLocked = false;
const _txWaiters = [];

function _acquireTxLock() {
  if (!_txLocked) {
    _txLocked = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => _txWaiters.push(resolve));
}

function _releaseTxLock() {
  if (_txWaiters.length > 0) {
    _txWaiters.shift()(); // wake next waiter
  } else {
    _txLocked = false;
  }
}

function createFallbackAdapter() {
  const adapter = {
    $disconnect: async () => {
      helpers.persist();
    },

    /**
     * Atomic credit transaction wrapper backed by SQLite BEGIN IMMEDIATE.
     * The callback receives the same adapter so all operations share the
     * open transaction context.  A serialization mutex guards concurrent
     * requests — essential because Node.js yields between `await` calls
     * and a second request could otherwise slip in before COMMIT.
     */
    $transaction: async (callback) => {
      await init();
      await _acquireTxLock();
      const db = getDb();
      db.run("BEGIN IMMEDIATE");
      try {
        const result = await callback(adapter);
        db.run("COMMIT");
        helpers.persist();
        return result;
      } catch (err) {
        try {
          db.run("ROLLBACK");
        } catch (_) {
          // ignore rollback errors — db may already be in an error state
        }
        throw err;
      } finally {
        _releaseTxLock();
      }
    },
  };

  const getAdapter = () => adapter;
  const ctx = { ...helpers };

  adapter.user = createUserRepository(ctx, getAdapter);
  adapter.reseller = createResellerRepository(ctx, getAdapter);
  adapter.pricingPlan = createPricingPlanRepository(ctx, getAdapter);
  adapter.apiIntegration = createApiIntegrationRepository(ctx, getAdapter);
  adapter.systemSetting = createSystemSettingRepository(ctx, getAdapter);
  adapter.playlist = createPlaylistRepository(ctx, getAdapter);
  adapter.devicePlaylist = createDevicePlaylistRepository(ctx, getAdapter);
  adapter.device = createDeviceRepository(ctx, getAdapter);
  adapter.application = createApplicationRepository(ctx, getAdapter);
  adapter.activatedApp = createActivatedAppRepository(ctx, getAdapter);
  adapter.parentChangeRequest = createParentChangeRequestRepository(
    ctx,
    getAdapter,
  );
  adapter.phoneVerificationCode = createPhoneVerificationCodeRepository(
    ctx,
    getAdapter,
  );
  adapter.notification = createNotificationRepository(ctx, getAdapter);
  adapter.creditTransaction = createCreditTransactionRepository(
    ctx,
    getAdapter,
  );

  return adapter;
}

module.exports = {
  createFallbackAdapter,
};
