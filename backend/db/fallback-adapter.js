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

function createFallbackAdapter() {
  const adapter = {
    $disconnect: async () => {
      helpers.persist();
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
