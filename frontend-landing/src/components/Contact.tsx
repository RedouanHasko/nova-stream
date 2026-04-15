import { motion } from "motion/react";
import { Mail, MessageSquare, Send } from "lucide-react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

export default function Contact() {
  const { t } = useI18n();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const subject = String(
      formData.get("subject") || t("Support request"),
    ).trim();
    const message = String(formData.get("message") || "").trim();
    const body = [`Name: ${name}`, `Email: ${email}`, "", message].join("\n");

    window.location.href = `mailto:support@novaplayer.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <section
      id="contact"
      className="py-16 sm:py-20 md:py-24 bg-black relative overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6">
              {t("Expert Support")}
            </h2>
            <p className="text-gray-400 text-lg mb-10 leading-relaxed">
              {t(
                "Facing technical challenges or have questions about activation? Our elite support team is standing by 24/7 to ensure your experience is flawless.",
              )}
            </p>

            <div className="space-y-8">
              <div className="flex items-center gap-6 p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <Mail className="text-red-500" size={24} />
                </div>
                <div>
                  <h4 className="text-white font-bold">{t("Email Support")}</h4>
                  <a
                    href="mailto:support@novaplayer.com"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    support@novaplayer.com
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-6 p-6 rounded-2xl bg-white/5 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <MessageSquare className="text-red-500" size={24} />
                </div>
                <div>
                  <h4 className="text-white font-bold">{t("Help Center")}</h4>
                  <Link
                    to="/help"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {t("Open support guidance and setup help")}
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-8 md:p-10 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm"
          >
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400 ml-1">
                    {t("Full Name")}
                  </label>
                  <input
                    name="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400 ml-1">
                    {t("Email Address")}
                  </label>
                  <input
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 ml-1">
                  {t("Subject")}
                </label>
                <input
                  name="subject"
                  type="text"
                  placeholder={t("How can we help?")}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 ml-1">
                  {t("Message")}
                </label>
                <textarea
                  name="message"
                  rows={4}
                  placeholder={t("Your message here...")}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 transition-colors resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-lg shadow-red-600/25"
              >
                <Send size={20} />
                {t("Send Message")}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
