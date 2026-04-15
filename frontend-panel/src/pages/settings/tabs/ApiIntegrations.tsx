import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Copy,
  Loader2,
  CheckCircle,
  Globe,
  Smartphone,
  ShieldAlert,
} from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";
import api from "../../../lib/api";

const DEFAULT_PROVIDER = "whatsapp-gateway";

function getIntegrationConfig(integration: any) {
  return integration?.config && typeof integration.config === "object"
    ? integration.config
    : {};
}

function looksLikeMessagingIntegration(integration: any) {
  const haystack = `${integration?.name || ""} ${integration?.provider || ""}`
    .toLowerCase()
    .trim();
  return (
    haystack.includes("whatsapp") ||
    haystack.includes("otp") ||
    haystack.includes("sms") ||
    haystack.includes("twilio") ||
    haystack.includes("baileys")
  );
}

export function ApiIntegrations() {
  const { t } = useI18n();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [messagingIntegrationId, setMessagingIntegrationId] = useState<
    number | null
  >(null);
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [fromNumber, setFromNumber] = useState("");
  const [useBuiltInGateway, setUseBuiltInGateway] = useState(true);
  const [gatewayUrl, setGatewayUrl] = useState("");
  const [gatewayToken, setGatewayToken] = useState("");
  const [gatewayStatus, setGatewayStatus] = useState<any | null>(null);
  const [startingGateway, setStartingGateway] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("100");
  const [hourlyLimit, setHourlyLimit] = useState("10");
  const [cooldownSeconds, setCooldownSeconds] = useState("45");
  const [burstLimit, setBurstLimit] = useState("3");
  const [burstWindowMinutes, setBurstWindowMinutes] = useState("1");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");

  const wait = (ms: number) =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await api.getIntegrations();
        if (!mounted) return;

        const items = Array.isArray(data) ? data : [];
        setIntegrations(items);

        const messagingIntegration = items.find(looksLikeMessagingIntegration);
        if (messagingIntegration) {
          const config = getIntegrationConfig(messagingIntegration);
          setMessagingIntegrationId(messagingIntegration.id);
          setProvider(messagingIntegration.provider || DEFAULT_PROVIDER);
          setFromNumber(
            (config.fromNumber || config.from || "").toString().trim(),
          );
          setGatewayUrl(
            (
              config.endpointUrl ||
              config.endpoint ||
              config.url ||
              messagingIntegration.webhookUrl ||
              ""
            )
              .toString()
              .trim(),
          );
          setGatewayToken(
            (
              config.token ||
              config.authToken ||
              config.apiKey ||
              messagingIntegration.apiKey ||
              ""
            )
              .toString()
              .trim(),
          );
          setDailyLimit(String(config.dailyLimit ?? 100));
          setHourlyLimit(String(config.hourlyLimit ?? 10));
          setCooldownSeconds(String(config.cooldownSeconds ?? 45));
          setBurstLimit(String(config.burstLimit ?? 3));
          setBurstWindowMinutes(String(config.burstWindowMinutes ?? 1));
          setTwilioSid(
            (
              config.accountSid ||
              config.sid ||
              messagingIntegration.apiKey ||
              ""
            )
              .toString()
              .trim(),
          );
          setTwilioAuthToken(
            (config.authToken || config.token || "").toString().trim(),
          );
          setUseBuiltInGateway(
            Boolean(config.embedded || config.useBuiltInGateway),
          );
        }
      } catch (e) {
        console.error("Failed to load integrations", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const loadGatewayStatus = useCallback(async () => {
    try {
      const status = await api.getWhatsAppGatewayStatus();
      setGatewayStatus(status);
    } catch (e) {
      console.error("Failed to load WhatsApp gateway status", e);
    }
  }, []);

  const handleStartBuiltInGateway = async () => {
    setStartingGateway(true);
    setError(null);
    try {
      let status = await api.startWhatsAppGateway();
      setGatewayStatus(status);

      const terminalStates = new Set([
        "ready",
        "qr-required",
        "logged-out",
        "error",
        "missing-dependency",
      ]);

      // After pressing refresh/start, actively poll until we know whether the
      // account is still linked (ready) or needs re-linking (QR/logged-out).
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const currentState = (status?.status || "idle").toString();
        if (terminalStates.has(currentState) || status?.qrDataUrl) {
          break;
        }

        await wait(1000);
        status = await api.getWhatsAppGatewayStatus();
        setGatewayStatus(status);
      }
    } catch (e: any) {
      setError(
        e?.message || t("Failed to start the built-in WhatsApp gateway."),
      );
    } finally {
      setStartingGateway(false);
    }
  };

  const handleSaveMessagingConfig = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      if (!fromNumber.trim()) {
        throw new Error(t("Please provide the sender WhatsApp number."));
      }

      let payload: any;

      if (provider === "whatsapp-gateway") {
        if (!useBuiltInGateway && !gatewayUrl.trim()) {
          throw new Error(t("Please provide the WhatsApp gateway URL."));
        }

        payload = {
          name: "WhatsApp OTP Gateway",
          provider: "whatsapp-gateway",
          active: true,
          apiKey: gatewayToken.trim() || null,
          webhookUrl: useBuiltInGateway ? null : gatewayUrl.trim(),
          config: {
            endpointUrl: useBuiltInGateway ? "" : gatewayUrl.trim(),
            token: gatewayToken.trim(),
            fromNumber: fromNumber.trim(),
            embedded: useBuiltInGateway,
            useBuiltInGateway,
            dailyLimit: Number(dailyLimit || 100),
            hourlyLimit: Number(hourlyLimit || 10),
            cooldownSeconds: Number(cooldownSeconds || 45),
            burstLimit: Number(burstLimit || 3),
            burstWindowMinutes: Number(burstWindowMinutes || 1),
          },
        };
      } else {
        if (!twilioSid.trim() || !twilioAuthToken.trim()) {
          throw new Error(t("Please provide the Twilio account credentials."));
        }

        payload = {
          name: "Twilio OTP SMS",
          provider: "twilio",
          active: true,
          apiKey: twilioSid.trim(),
          config: {
            accountSid: twilioSid.trim(),
            authToken: twilioAuthToken.trim(),
            fromNumber: fromNumber.trim(),
          },
        };
      }

      const savedIntegration = messagingIntegrationId
        ? await api.updateIntegration(messagingIntegrationId, payload)
        : await api.createIntegration(payload);

      setMessagingIntegrationId(savedIntegration.id);
      setIntegrations((prev) => {
        const exists = prev.some(
          (integration) => integration.id === savedIntegration.id,
        );
        return exists
          ? prev.map((integration) =>
              integration.id === savedIntegration.id
                ? savedIntegration
                : integration,
            )
          : [savedIntegration, ...prev];
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || t("Failed to save messaging configuration."));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (provider === "whatsapp-gateway" && useBuiltInGateway) {
      loadGatewayStatus();
    }
  }, [provider, useBuiltInGateway, loadGatewayStatus]);

  useEffect(() => {
    if (!(provider === "whatsapp-gateway" && useBuiltInGateway)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadGatewayStatus();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [provider, useBuiltInGateway, loadGatewayStatus]);

  const gatewayStatusValue = (gatewayStatus?.status || "idle").toString();
  const gatewayNeedsRelink =
    gatewayStatusValue === "logged-out" || gatewayStatusValue === "qr-required";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        {t("Loading integrations...")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">
            {t("OTP Delivery Provider")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Configure the WhatsApp number and gateway used to send password reset verification codes.",
            )}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">
                  {t("Safe WhatsApp sending limits")}
                </p>
                <p className="mt-1">
                  {t(
                    "To reduce ban risk, the server enforces cooldown, burst, hourly, and daily caps before sending WhatsApp OTPs.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="otp-provider"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Provider")}
              </label>
              <select
                id="otp-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="whatsapp-gateway">
                  {t("WhatsApp Gateway")}
                </option>
                <option value="twilio">{t("Twilio SMS")}</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sender-number"
                className="block text-sm font-medium leading-6 text-muted-foreground"
              >
                {t("Sender number")}
              </label>
              <div className="mt-2 relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  id="sender-number"
                  type="text"
                  value={fromNumber}
                  onChange={(e) => setFromNumber(e.target.value)}
                  placeholder={t("e.g. +212600000000")}
                  className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
          </div>

          {provider === "whatsapp-gateway" && (
            <div className="rounded-xl border border-border bg-foreground/5 p-4">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={useBuiltInGateway}
                  onChange={(e) => setUseBuiltInGateway(e.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    {t(
                      "Use the built-in self-hosted gateway from this project",
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t(
                      "When enabled, the backend keeps the WhatsApp session running in the background and you do not need a separate gateway server URL.",
                    )}
                  </span>
                </span>
              </label>
            </div>
          )}

          {provider === "whatsapp-gateway" ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {!useBuiltInGateway && (
                  <div>
                    <label
                      htmlFor="gateway-url"
                      className="block text-sm font-medium leading-6 text-muted-foreground"
                    >
                      {t("Gateway URL")}
                    </label>
                    <div className="mt-2 relative rounded-xl shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <input
                        id="gateway-url"
                        type="url"
                        value={gatewayUrl}
                        onChange={(e) => setGatewayUrl(e.target.value)}
                        placeholder={t("https://your-bot-server/send-otp")}
                        className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="gateway-token"
                    className="block text-sm font-medium leading-6 text-muted-foreground"
                  >
                    {t("Gateway token (optional)")}
                  </label>
                  <div className="mt-2 relative rounded-xl shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Key className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <input
                      id="gateway-token"
                      type="text"
                      value={gatewayToken}
                      onChange={(e) => setGatewayToken(e.target.value)}
                      placeholder={t("Secret token used by your gateway")}
                      className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>
              </div>

              {useBuiltInGateway && (
                <div className="rounded-xl border border-border bg-background/70 p-4 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {t("Built-in WhatsApp gateway status")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {gatewayStatus?.connected
                          ? t(
                              "WhatsApp is connected and ready to send OTP messages.",
                            )
                          : t(
                              "Start the built-in gateway and scan the QR code with the WhatsApp number you want to use.",
                            )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartBuiltInGateway}
                      disabled={startingGateway}
                      className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      {startingGateway
                        ? t("Starting gateway...")
                        : t("Start / Refresh Gateway")}
                    </button>
                  </div>

                  {gatewayNeedsRelink ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                      {t(
                        "WhatsApp appears disconnected (for example, if the linked device was removed). Start/refresh the gateway and scan the QR code again.",
                      )}
                    </div>
                  ) : null}

                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {t("Status")}:
                    </span>
                    {gatewayStatus?.status || t("idle")}
                    {gatewayStatus?.phoneNumber
                      ? ` • ${t("Connected number")}: ${gatewayStatus.phoneNumber}`
                      : ""}
                  </div>

                  {gatewayStatus?.qrDataUrl ? (
                    <div className="flex justify-center">
                      <img
                        src={gatewayStatus.qrDataUrl}
                        alt={t("WhatsApp QR code")}
                        className="h-56 w-56 rounded-xl border border-border bg-white p-3"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t("Anti-ban safety limits")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    "Recommended defaults: daily 50–100, hourly 10–15, cooldown 30–60 seconds, burst 3 per minute.",
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className="block text-sm font-medium leading-6 text-muted-foreground">
                    {t("Daily limit")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium leading-6 text-muted-foreground">
                    {t("Hourly limit")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(e.target.value)}
                    className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium leading-6 text-muted-foreground">
                    {t("Cooldown (seconds)")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={cooldownSeconds}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                    className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium leading-6 text-muted-foreground">
                    {t("Burst limit")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={burstLimit}
                    onChange={(e) => setBurstLimit(e.target.value)}
                    className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium leading-6 text-muted-foreground">
                    {t("Burst window (minutes)")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={burstWindowMinutes}
                    onChange={(e) => setBurstWindowMinutes(e.target.value)}
                    className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="twilio-sid"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Twilio Account SID")}
                </label>
                <input
                  id="twilio-sid"
                  type="text"
                  value={twilioSid}
                  onChange={(e) => setTwilioSid(e.target.value)}
                  className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
              </div>

              <div>
                <label
                  htmlFor="twilio-token"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Twilio Auth Token")}
                </label>
                <input
                  id="twilio-token"
                  type="text"
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                  className="mt-2 block w-full rounded-xl border-0 bg-input px-3 py-2.5 text-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-500 font-medium">
              {error}
            </div>
          )}

          {saved && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-500 font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {t("Messaging configuration saved successfully!")}
            </div>
          )}
        </div>

        <div className="bg-foreground/5 px-6 py-4 flex justify-end border-t border-border">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveMessagingConfig}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-colors gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("Saving...") : t("Save Messaging Config")}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground">
            {t("Configured Integrations")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Review the currently saved provider records.")}
          </p>
        </div>
        <div className="px-6 py-6 space-y-4">
          {integrations.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("No API integrations configured yet.")}
            </div>
          ) : (
            integrations.map((integration) => (
              <div
                key={integration.id}
                className="flex items-center justify-between p-4 rounded-xl bg-foreground/5 border border-border"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center flex-shrink-0">
                    <Key className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {integration.name || t("API Key")}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {integration.provider || t("Unknown provider")}
                    </p>
                  </div>
                </div>
                {integration.apiKey ? (
                  <button
                    onClick={() => handleCopy(integration.apiKey)}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    title={t("Copy API Key")}
                    aria-label={t("Copy API Key")}
                  >
                    {copied === integration.apiKey ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
