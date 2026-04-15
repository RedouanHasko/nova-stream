import { ArrowRight, Download, Headset, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

type Section = {
  title: string;
  body: string[];
};

type PageProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: Section[];
  primaryLink?: { label: string; to: string };
  secondaryLink?: { label: string; to: string };
};

function StaticPage({
  eyebrow,
  title,
  description,
  sections,
  primaryLink,
  secondaryLink,
}: PageProps) {
  const { t } = useI18n();

  return (
    <main className="pt-28 pb-24 min-h-screen bg-black selection:bg-red-500/30 selection:text-red-200">
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-600/5 blur-[120px] rounded-full" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-14">
            <p className="text-xs font-black tracking-[0.35em] text-red-500 uppercase mb-4">
              {t(eyebrow)}
            </p>
            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
              {t(title)}
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed">
              {t(description)}
            </p>
          </div>

          {(primaryLink || secondaryLink) && (
            <div className="flex flex-wrap gap-4 mb-16">
              {primaryLink && (
                <Link
                  to={primaryLink.to}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-bold transition-all"
                >
                  {t(primaryLink.label)}
                  <ArrowRight size={18} />
                </Link>
              )}
              {secondaryLink && (
                <Link
                  to={secondaryLink.to}
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-2xl font-bold border border-white/10 transition-all"
                >
                  {t(secondaryLink.label)}
                </Link>
              )}
            </div>
          )}

          <div className="space-y-8">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10"
              >
                <h2 className="text-2xl font-bold text-white mb-5">
                  {t(section.title)}
                </h2>
                <div className="space-y-4 text-gray-300 leading-relaxed">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{t(paragraph)}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export function DownloadsPage() {
  return (
    <StaticPage
      eyebrow="Downloads"
      title="Install NOVA Player On The Device You Already Use"
      description="Choose your platform, install the NOVA Player app, then activate your device using the MAC address and device key shown inside the app."
      primaryLink={{ label: "Activate Device", to: "/device/activate" }}
      secondaryLink={{ label: "Contact Support", to: "/#contact" }}
      sections={[
        {
          title: "Supported Platforms",
          body: [
            "NOVA Player is available for Smart TVs, Android TV, Firestick, Android and iOS phones, Windows, macOS, Apple TV, and modern browsers.",
            "If your reseller or deployment flow provides a branded app package, use the installer or store listing that was supplied with your service.",
          ],
        },
        {
          title: "Installation Checklist",
          body: [
            "Install the app on your target device, open it once, then note the MAC address and device key displayed in the app settings or activation screen.",
            "After installation, continue to the activation page to unlock yearly or lifetime access for that specific device.",
          ],
        },
        {
          title: "Need A Direct Package?",
          body: [
            "If you need a direct installer, migration guidance, or help locating the right app store version for your platform, contact support from the contact page and include your device model.",
          ],
        },
      ]}
    />
  );
}

export function HelpCenterPage() {
  return (
    <StaticPage
      eyebrow="Help Center"
      title="Fast Answers For Activation, Device Keys, And Playlist Access"
      description="Use this page as the central support entry point before backend-powered self-service is wired in."
      primaryLink={{ label: "Open Activation", to: "/device/activate" }}
      secondaryLink={{ label: "FAQ", to: "/#faq" }}
      sections={[
        {
          title: "Device Key Help",
          body: [
            "Your device key is shown inside the NOVA Player application on the device itself. Open the app, go to the device or activation section, and copy the key exactly as displayed.",
            "If the key is missing or unreadable, restart the app on the device first. If the problem continues, contact support and include your device type and MAC address.",
          ],
        },
        {
          title: "Activation Guidance",
          body: [
            "Activation requires the MAC address and device key from the target device. Choose a yearly or lifetime plan, then complete activation for that single device.",
            "If your MAC address changes because the network interface changed, you may need to reactivate or request a MAC transfer.",
          ],
        },
        {
          title: "Playlist Management",
          body: [
            "Playlist uploads and account-level management will be connected to the backend next. For now, the landing interface is ready for navigation and guidance, but not yet for live playlist persistence.",
          ],
        },
      ]}
    />
  );
}

export function ResellerPage() {
  return (
    <StaticPage
      eyebrow="Resellers"
      title="Reseller Access Starts With A Direct Support Intake"
      description="If you manage client activations, branded deployments, or volume onboarding, this page gives users a working path instead of a dead CTA."
      primaryLink={{ label: "Contact Sales", to: "/#contact" }}
      secondaryLink={{ label: "Email Support", to: "/help" }}
      sections={[
        {
          title: "Who This Is For",
          body: [
            "Use the reseller path if you need multi-device onboarding, activation assistance for customers, or help coordinating deployments for your applications in the system.",
          ],
        },
        {
          title: "What To Include",
          body: [
            "When reaching out, include your company name, estimated number of devices, supported platforms, and whether you need branded app guidance or account administration support.",
          ],
        },
        {
          title: "Current Status",
          body: [
            "The dedicated reseller backend workflow is not linked yet, so the frontend now routes resellers to a real contact and support path rather than leaving them on a broken anchor.",
          ],
        },
      ]}
    />
  );
}

function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: Section[];
}) {
  return (
    <StaticPage
      eyebrow="Legal"
      title={title}
      description="These frontend pages provide working destinations for all legal and policy links until the final backend-backed content workflow is connected."
      primaryLink={{ label: "Support", to: "/help" }}
      secondaryLink={{ label: "Contact", to: "/#contact" }}
      sections={sections}
    />
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      sections={[
        {
          title: "Information We Use",
          body: [
            "For activation and support, NOVA Player may rely on device identifiers such as MAC address, device key, and contact details voluntarily submitted through support forms.",
            "No content subscriptions or channel packages are sold through this application. The platform is strictly a media player and activation interface.",
          ],
        },
        {
          title: "How Data Is Used",
          body: [
            "Submitted information is used to support activation, troubleshoot device access, and respond to support or reseller inquiries.",
          ],
        },
      ]}
    />
  );
}

export function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms Of Service"
      sections={[
        {
          title: "Service Scope",
          body: [
            "NOVA Player is a software player and activation service. It does not provide channels, playlists, or subscription content.",
            "Users are responsible for the playlists and content sources they load into the application.",
          ],
        },
        {
          title: "Activation Terms",
          body: [
            "Activations are tied to the device identity presented during activation. Changes to the underlying device or network interface can require revalidation or support intervention.",
          ],
        },
      ]}
    />
  );
}

export function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      sections={[
        {
          title: "Activation Purchases",
          body: [
            "Activation purchases are intended for use on a specific device and should only be completed after confirming the device details are correct.",
            "As reflected elsewhere in the app content, purchases are generally treated as non-refundable after activation has been processed.",
          ],
        },
      ]}
    />
  );
}

export function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      sections={[
        {
          title: "Browser Storage",
          body: [
            "This frontend may use browser storage or basic client-side state to preserve interface preferences, session views, or interaction state during use.",
            "A fuller production cookie and storage policy can be connected later if tracking or analytics tooling is added.",
          ],
        },
      ]}
    />
  );
}

export function ResourceHighlights() {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <Download className="text-red-500 mb-4" size={28} />
        <h3 className="text-white font-bold mb-2">{t("Platform Downloads")}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          {t(
            "Direct users to installation guidance instead of leaving download CTAs inert.",
          )}
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <Headset className="text-red-500 mb-4" size={28} />
        <h3 className="text-white font-bold mb-2">{t("Support Routing")}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          {t(
            "Every support-oriented button now has a real frontend destination.",
          )}
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <ShieldCheck className="text-red-500 mb-4" size={28} />
        <h3 className="text-white font-bold mb-2">{t("Legal Destinations")}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">
          {t(
            "Policy and terms links now land on visible pages instead of placeholders.",
          )}
        </p>
      </div>
    </div>
  );
}
