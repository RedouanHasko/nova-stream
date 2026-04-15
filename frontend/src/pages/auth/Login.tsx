import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext";
import { useTheme } from "../../contexts/ThemeContext";
import api from "../../lib/api";
import {
  Lock,
  Mail,
  AlertCircle,
  Languages,
  Moon,
  Sun,
  ArrowRight,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion } from "motion/react";
import { PhoneNumberInput } from "../../components/common/PhoneNumberInput";
import RecaptchaBox, {
  requestInvisibleRecaptchaToken,
} from "../../components/common/RecaptchaBox";

const LANGUAGE_OPTIONS = [
  { code: "EN", label: "EN" },
  { code: "FR", label: "FR" },
  { code: "AR", label: "AR" },
] as const;

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotMessageTone, setForgotMessageTone] = useState<
    "info" | "success" | "error"
  >("info");
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetPhone, setResetPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showConfirmResetPassword, setShowConfirmResetPassword] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState<string | null>(
    null,
  );
  const [loginCaptchaResetSignal, setLoginCaptchaResetSignal] = useState(0);
  const { login } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const isRecaptchaEnabled =
    import.meta.env.VITE_RECAPTCHA_ENABLED === "true" &&
    Boolean(import.meta.env.VITE_RECAPTCHA_SITE_KEY);
  const recaptchaMode =
    import.meta.env.VITE_RECAPTCHA_MODE === "invisible"
      ? "invisible"
      : "widget";

  const setForgotFeedback = (
    message: string,
    tone: "info" | "success" | "error" = "info",
  ) => {
    setForgotMessage(message);
    setForgotMessageTone(tone);
  };

  const isRecaptchaExpiredMessage = (message?: string) =>
    typeof message === "string" &&
    /reCAPTCHA check expired|timeout-or-duplicate/i.test(message);

  const handleLoginCaptchaVerify = useCallback((token: string | null) => {
    setLoginCaptchaToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setForgotMessage("");
    setForgotMessageTone("info");

    let captchaToken = loginCaptchaToken;
    if (isRecaptchaEnabled && recaptchaMode === "invisible") {
      try {
        captchaToken = await requestInvisibleRecaptchaToken({
          action: "login",
          mode: recaptchaMode,
        });
        setLoginCaptchaToken(captchaToken);
      } catch (err: any) {
        setError(
          err?.message || t("reCAPTCHA could not be completed right now."),
        );
        return;
      }
    }

    if (isRecaptchaEnabled && !captchaToken) {
      setError(t("Please complete the reCAPTCHA challenge."));
      return;
    }

    setIsLoading(true);

    try {
      try {
        await login(email, password, captchaToken);
      } catch (err: any) {
        if (
          isRecaptchaEnabled &&
          recaptchaMode === "invisible" &&
          isRecaptchaExpiredMessage(err?.message)
        ) {
          const freshCaptchaToken = await requestInvisibleRecaptchaToken({
            action: "login_retry",
            mode: recaptchaMode,
          });
          setLoginCaptchaToken(freshCaptchaToken);
          await login(email, password, freshCaptchaToken);
        } else {
          throw err;
        }
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.message || t("Invalid email or password"));
      if (isRecaptchaEnabled) {
        setLoginCaptchaResetSignal((current) => current + 1);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setError("");
    setForgotMessage("");
    setForgotMessageTone("info");
    setShowResetPanel(true);
    setCodeRequested(false);
    setVerificationCode("");
    setResetPassword("");
    setConfirmResetPassword("");
    if (!email.trim()) {
      setForgotFeedback(t("Please enter the account email first."), "info");
    }
  };

  const handleRequestResetCode = async () => {
    setError("");
    setForgotMessage("");
    setForgotMessageTone("info");

    if (!email.trim()) {
      setForgotFeedback(t("Please enter the account email first."), "info");
      return;
    }

    if (!resetPhone.trim()) {
      setForgotFeedback(
        t("Please provide the registered phone number."),
        "info",
      );
      return;
    }

    setIsResetting(true);
    try {
      const result = await api.requestPasswordResetCode(
        email.trim(),
        resetPhone.trim(),
      );

      setCodeRequested(Boolean(result?.codeIssued));
      setForgotFeedback(
        result?.devCode
          ? `${result?.message || t("Verification code sent to your phone.")} (${t("Development code")}: ${result.devCode})`
          : result?.message || t("Verification code sent to your phone."),
        "success",
      );
    } catch (err: any) {
      setShowResetPanel(true);
      setCodeRequested(false);
      setForgotFeedback(
        err?.message || t("Unable to send the verification code right now."),
        "error",
      );
    } finally {
      setIsResetting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setForgotMessage("");
    setForgotMessageTone("info");

    if (!email.trim()) {
      setForgotFeedback(t("Please enter the account email first."), "info");
      return;
    }
    if (!resetPhone.trim()) {
      setForgotFeedback(
        t("Please provide the registered phone number."),
        "info",
      );
      return;
    }
    if (!verificationCode.trim()) {
      setForgotFeedback(
        t("Please enter the verification code sent to your phone."),
        "error",
      );
      return;
    }
    if (resetPassword.trim().length < 8) {
      setForgotFeedback(
        t("Please enter a new password with at least 8 characters."),
        "error",
      );
      return;
    }
    if (resetPassword !== confirmResetPassword) {
      setForgotFeedback(t("The new passwords do not match."), "error");
      return;
    }

    setIsResetting(true);
    try {
      const result = await api.requestPasswordReset(
        email.trim(),
        resetPhone.trim(),
        verificationCode.trim(),
        resetPassword,
      );
      setPassword(resetPassword);
      setResetPhone("");
      setVerificationCode("");
      setResetPassword("");
      setConfirmResetPassword("");
      setCodeRequested(false);
      setShowResetPanel(false);
      setForgotFeedback(
        result?.message ||
          t(
            "Password reset successful. You can now sign in with your new password.",
          ),
        "success",
      );
    } catch (err: any) {
      setShowResetPanel(true);
      setForgotFeedback(
        err?.message || t("Unable to reset the password right now."),
        "error",
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-1 flex-col justify-center overflow-hidden bg-background px-6 py-12 transition-colors duration-300 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-10 top-12 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -right-10 bottom-12 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-sm backdrop-blur-sm">
          <span
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <Languages className="h-4 w-4" />
          </span>
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = language === option.code;
            return (
              <button
                key={option.code}
                type="button"
                onClick={() => setLanguage(option.code)}
                aria-pressed={isActive}
                title={`${t("Select language")}: ${option.code}`}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t("Toggle theme")}
          title={t("Toggle theme")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/95 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="flex justify-center">
          <div className="rounded-2xl bg-card p-2 shadow-lg shadow-foreground/10 ring-1 ring-border">
            <img
              src="/favicon.png"
              alt="NOVA Panel"
              className="h-14 w-14 rounded-xl object-contain"
            />
          </div>
        </div>
        <div className="mt-6 text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            NOVA Panel
          </span>
          <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-foreground">
            {t("Sign in to your account")}
          </h2>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-10 sm:mx-auto sm:w-full sm:max-w-xl"
      >
        <div className="overflow-hidden border border-border bg-card/95 shadow-xl backdrop-blur sm:rounded-3xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl bg-rose-500/10 p-4 border border-rose-500/20">
                  <div className="flex">
                    <div className="shrink-0">
                      <AlertCircle
                        className="h-5 w-5 text-rose-500"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-rose-500">
                        {error}
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Email address")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium leading-6 text-muted-foreground"
                >
                  {t("Password")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Lock
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword ? t("Hide password") : t("Show password")
                    }
                    title={
                      showPassword ? t("Hide password") : t("Show password")
                    }
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm font-medium text-foreground transition-opacity hover:opacity-70"
                  >
                    {t("Forgot password?")}
                  </button>
                </div>
              </div>

              {showResetPanel && (
                <div className="space-y-4 rounded-2xl border border-border bg-background/70 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <KeyRound className="h-4 w-4" />
                    <span>{t("Reset password")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Confirm your account with the registered phone number, request a verification code, then choose a new password.",
                    )}
                  </p>

                  <div>
                    <label
                      htmlFor="reset-phone"
                      className="block text-sm font-medium leading-6 text-muted-foreground"
                    >
                      {t("Registered phone number")}
                    </label>
                    <div className="mt-2">
                      <PhoneNumberInput
                        id="reset-phone"
                        name="reset-phone"
                        value={resetPhone}
                        onChange={(value) => {
                          setResetPhone(value);
                          setCodeRequested(false);
                        }}
                        placeholder="600000000"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRequestResetCode}
                      disabled={isResetting}
                      className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResetting ? t("Sending...") : t("Send code")}
                    </button>
                  </div>

                  {codeRequested ? (
                    <>
                      <div>
                        <label
                          htmlFor="verification-code"
                          className="block text-sm font-medium leading-6 text-muted-foreground"
                        >
                          {t("Verification code")}
                        </label>
                        <div className="relative mt-2 rounded-xl shadow-sm">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <KeyRound className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <input
                            id="verification-code"
                            name="verification-code"
                            type="text"
                            inputMode="numeric"
                            value={verificationCode}
                            onChange={(e) =>
                              setVerificationCode(e.target.value)
                            }
                            className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                            placeholder="123456"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="new-password"
                            className="block text-sm font-medium leading-6 text-muted-foreground"
                          >
                            {t("New password")}
                          </label>
                          <div className="relative mt-2 rounded-xl shadow-sm">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <Lock className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <input
                              id="new-password"
                              name="new-password"
                              type={showResetPassword ? "text" : "password"}
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowResetPassword((current) => !current)
                              }
                              aria-label={
                                showResetPassword
                                  ? t("Hide password")
                                  : t("Show password")
                              }
                              title={
                                showResetPassword
                                  ? t("Hide password")
                                  : t("Show password")
                              }
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {showResetPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="confirm-new-password"
                            className="block text-sm font-medium leading-6 text-muted-foreground"
                          >
                            {t("Confirm new password")}
                          </label>
                          <div className="relative mt-2 rounded-xl shadow-sm">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <Lock className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <input
                              id="confirm-new-password"
                              name="confirm-new-password"
                              type={
                                showConfirmResetPassword ? "text" : "password"
                              }
                              value={confirmResetPassword}
                              onChange={(e) =>
                                setConfirmResetPassword(e.target.value)
                              }
                              className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-11 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                              placeholder="••••••••"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowConfirmResetPassword(
                                  (current) => !current,
                                )
                              }
                              aria-label={
                                showConfirmResetPassword
                                  ? t("Hide password")
                                  : t("Show password")
                              }
                              title={
                                showConfirmResetPassword
                                  ? t("Hide password")
                                  : t("Show password")
                              }
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {showConfirmResetPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handlePasswordReset}
                        disabled={isResetting}
                        className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isResetting ? t("Resetting...") : t("Reset password")}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "The new password fields will appear after the verification code is requested.",
                      )}
                    </p>
                  )}
                </div>
              )}

              {forgotMessage && (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    forgotMessageTone === "error"
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : forgotMessageTone === "success"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{forgotMessage}</p>
                  </div>
                </div>
              )}

              {isRecaptchaEnabled && (
                <RecaptchaBox
                  theme={theme === "dark" ? "dark" : "light"}
                  resetSignal={loginCaptchaResetSignal}
                  onVerify={handleLoginCaptchaVerify}
                />
              )}

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-3 py-2.5 text-sm font-semibold leading-6 text-background shadow-sm transition-colors hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>{isLoading ? t("Signing in...") : t("Sign in")}</span>
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </form>

            {/* Demo credentials removed */}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
