import {
  Sparkles,
  Mail,
  Phone,
  MapPin,
  Download,
  Headset,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className="bg-transparent border-t border-white/10 pt-12 sm:pt-16 md:pt-20 pb-8 md:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-12 md:mb-16 glass-surface rounded-3xl p-6 sm:p-8 md:p-10">
          {/* Brand */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
                <Sparkles className="text-white fill-current" size={20} />
              </div>
              <div className="flex flex-col -space-y-1">
                <span className="text-xl font-black text-white tracking-tighter italic">
                  NOVA
                </span>
                <span className="text-[8px] font-black text-red-600 tracking-[0.3em] uppercase ml-0.5">
                  PLAYER
                </span>
              </div>
            </div>
            <p className="text-gray-300/90 leading-relaxed max-w-xs">
              {t(
                "The most advanced and user-friendly media player for your favorite content. Fast, secure, and supports all major formats.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/downloads"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-gray-200/90 hover:text-white hover:border-red-500/40 transition-colors"
              >
                <Download size={16} />
                {t("DOWNLOADS")}
              </Link>
              <Link
                to="/help"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-gray-200/90 hover:text-white hover:border-red-500/40 transition-colors"
              >
                <Headset size={16} />
                {t("Help Center")}
              </Link>
              <Link
                to="/reseller"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-gray-200/90 hover:text-white hover:border-red-500/40 transition-colors"
              >
                <Users size={16} />
                {t("I'M RESELLER")}
              </Link>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-bold text-lg mb-6">
              {t("Quick Links")}
            </h4>
            <ul className="space-y-4 text-gray-300/85">
              <li>
                <Link to="/" className="hover:text-red-500 transition-colors">
                  {t("Home")}
                </Link>
              </li>
              <li>
                <a
                  href="/#features"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Features")}
                </a>
              </li>
              <li>
                <a
                  href="/#pricing"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Pricing")}
                </a>
              </li>
              <li>
                <a
                  href="/#devices"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Devices")}
                </a>
              </li>
              <li>
                <Link
                  to="/downloads"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Download App")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-bold text-lg mb-6">
              {t("SUPPORT")}
            </h4>
            <ul className="space-y-4 text-gray-300/85">
              <li>
                <Link
                  to="/help"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Help Center")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/terms"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Terms of Service")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/privacy"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Privacy Policy")}
                </Link>
              </li>
              <li>
                <Link
                  to="/legal/refund"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Refund Policy")}
                </Link>
              </li>
              <li>
                <a
                  href="/#contact"
                  className="hover:text-red-500 transition-colors"
                >
                  {t("Contact Us")}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-white font-bold text-lg mb-6">
              {t("Contact Us")}
            </h4>
            <ul className="space-y-4 text-gray-300/85">
              <li className="flex items-start gap-3">
                <Mail size={20} className="text-red-500 shrink-0" />
                <a
                  href="mailto:support@novaplayer.com"
                  className="hover:text-white transition-colors"
                >
                  support@novaplayer.com
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Phone size={20} className="text-red-500 shrink-0" />
                <a
                  href="tel:+15551234567"
                  className="hover:text-white transition-colors"
                >
                  +1 (555) 123-4567
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={20} className="text-red-500 shrink-0" />
                <a
                  href="/#contact"
                  className="hover:text-white transition-colors"
                >
                  {t("Support contact form")}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-10 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 text-gray-400 text-sm">
          <p>{`© 2026 NOVA Player. ${t("All rights reserved.")}`}</p>
          <div className="flex items-center gap-6">
            <Link
              to="/legal/privacy"
              className="hover:text-white transition-colors"
            >
              {t("Privacy Policy")}
            </Link>
            <Link
              to="/legal/terms"
              className="hover:text-white transition-colors"
            >
              {t("Terms of Service")}
            </Link>
            <Link
              to="/legal/cookies"
              className="hover:text-white transition-colors"
            >
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
