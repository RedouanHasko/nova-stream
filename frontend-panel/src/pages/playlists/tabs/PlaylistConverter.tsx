import { useState } from "react";
import {
  RefreshCw,
  ListVideo,
  PlusCircle,
  Search,
  CheckCircle,
  Zap,
} from "lucide-react";
import { useI18n } from "../../../contexts/I18nContext";

export function PlaylistConverter() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"create" | "parse">("create");

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Converter Form */}
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden transition-colors duration-300">
        <div className="border-b border-border px-6 py-5 bg-input">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-400" />
            {t("M3U URL Converter")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Convert your IPTV credentials to M3U playlist URLs or parse existing URLs",
            )}
          </p>
        </div>

        {/* Tab-like switcher UI */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("create")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === "create" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <PlusCircle className="h-4 w-4" /> {t("Create URL")}
          </button>
          <button
            onClick={() => setActiveTab("parse")}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === "parse" ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Search className="h-4 w-4" /> {t("Parse URL")}
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {activeTab === "create" ? (
            <>
              <div>
                <label
                  htmlFor="hostname"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("Hostname *")}
                </label>
                <input
                  type="text"
                  id="hostname"
                  className="mt-2 block w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm"
                  placeholder={t("Your Hostname")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Include http:// prefix")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium leading-6 text-foreground"
                  >
                    {t("Username")}
                  </label>
                  <input
                    type="text"
                    id="username"
                    className="mt-2 block w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground ring-1 ring-inset ring-border sm:text-sm"
                    placeholder={t("Your username")}
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium leading-6 text-foreground"
                  >
                    {t("Password")}
                  </label>
                  <input
                    type="text"
                    id="password"
                    className="mt-2 block w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground ring-1 ring-inset ring-border sm:text-sm"
                    placeholder={t("Your password")}
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="parse-url"
                className="block text-sm font-medium leading-6 text-foreground"
              >
                {t("Paste M3U URL")}
              </label>
              <textarea
                id="parse-url"
                rows={4}
                className="mt-2 block w-full rounded-xl border-0 bg-input py-2.5 px-4 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-ring sm:text-sm"
                placeholder={t("Paste your M3U URL here...")}
              />
            </div>
          )}
        </div>
        <div className="bg-input px-6 py-4 flex justify-between items-center border-t border-border">
          <button className="text-sm text-muted-foreground hover:text-foreground">
            {t("Clear")}
          </button>
          <button className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-all gap-2">
            <RefreshCw className="h-4 w-4" />
            {activeTab === "create" ? t("Convert to M3U URL") : t("Parse URL")}
          </button>
        </div>
      </div>

      {/* Instructions Section */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-card shadow-sm border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-emerald-500" />{" "}
            {t("How to Create M3U URLs")}
          </h3>
          <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
            <li>
              <span className="font-medium text-foreground">
                {t("Enter Your IPTV Server Details:")}
              </span>{" "}
              {t(
                "Input your IPTV provider's hostname. Make sure to include the protocol (http://).",
              )}
            </li>
            <li>
              <span className="font-medium text-foreground">
                {t("Add Authentication Credentials:")}
              </span>{" "}
              {t("Enter your username and password.")}
            </li>
            <li>
              <span className="font-medium text-foreground">
                {t("Generate Your M3U URL:")}
              </span>{" "}
              {t('Click "Convert to M3U URL" to generate your playlist URL.')}
            </li>
          </ol>
        </div>
        <div className="rounded-2xl bg-card shadow-sm border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-500" />{" "}
            {t("How to Parse Existing M3U URLs")}
          </h3>
          <ol className="text-sm text-muted-foreground space-y-3 list-decimal list-inside">
            <li>
              <span className="font-medium text-foreground">
                {t("Paste Your M3U URL:")}
              </span>{" "}
              {t("Copy and paste any M3U playlist URL into the text area.")}
            </li>
            <li>
              <span className="font-medium text-foreground">
                {t("Extract Information:")}
              </span>{" "}
              {t('Click "Parse URL" to automatically extract the components.')}
            </li>
            <li>
              <span className="font-medium text-foreground">
                {t("Copy Individual Components:")}
              </span>{" "}
              {t("Each extracted component can be copied individually.")}
            </li>
          </ol>
        </div>
      </div>

      {/* About Section */}
      <div className="rounded-2xl bg-card shadow-sm border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">
          {t("What is M3U and Why Use This Tool?")}
        </h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground mb-2">
              {t("Understanding M3U Format")}
            </p>
            <p>
              {t(
                "M3U is a computer file format for a multimedia playlist. Originally developed for audio files, M3U is now widely used for IPTV streaming.",
              )}
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground mb-2">
              {t("Benefits of Our M3U Tool")}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("Instant Conversion")}</li>
              <li>{t("Reverse Engineering")}</li>
              <li>{t("No Registration Required")}</li>
              <li>{t("Privacy Focused")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Compatibility Section */}
      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            icon: ListVideo,
            title: t("M3U Plus"),
            desc: t("Extended M3U format with metadata support."),
          },
          {
            icon: CheckCircle,
            title: t("Transport Stream"),
            desc: t("Optimized for streaming with TS output."),
          },
          {
            icon: Zap,
            title: t("Fast & Reliable"),
            desc: t("Quick URL generation and parsing."),
          },
        ].map((item, i) => (
          <div
            key={i}
            className="rounded-2xl bg-card shadow-sm border border-border p-6 text-center flex flex-col items-center"
          >
            <item.icon className="h-8 w-8 text-indigo-500 mb-4" />
            <h4 className="font-semibold text-foreground mb-2">{item.title}</h4>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
