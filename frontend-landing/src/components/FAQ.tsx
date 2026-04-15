import { motion, AnimatePresence } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../contexts/I18nContext";

const faqs = [
  {
    question:
      "Does NOVA PLAYER contain any channels? Where can I get a good playlist?",
    answer:
      "NOVA PLAYER does not contain any channels or playlists. It is a media player that allows you to play your own content. You must acquire your own playlist from an IPTV provider.",
  },
  {
    question: "Does the NOVA PLAYER APP have an EPG-SYSTEM?",
    answer:
      "Yes, NOVA PLAYER supports EPG (Electronic Program Guide) if your playlist provider includes an EPG URL in the M3U file or if you provide it manually in the settings.",
  },
  {
    question: "Why I can not start the APP?",
    answer:
      "Ensure your device is compatible and that you have the latest version of the app installed. If it still won't start, try re-installing the application.",
  },
  {
    question:
      "My MAC address has changed after I switched to another connection type.",
    answer:
      "The MAC address is unique to your device's network interface. If you switch from Wi-Fi to Ethernet, the MAC address will change. You may need to re-activate your device or update your playlist provider with the new MAC address.",
  },
  {
    question:
      "Why is the app not working when the PLAYLIST worked on my computer?",
    answer:
      "This could be due to network restrictions, incompatible formats, or the provider limiting the number of simultaneous connections. Ensure your device is on the same network and that your provider supports the app.",
  },
  {
    question: "My playlist won't open, freezes or slows down. What to do?",
    answer:
      "Check your internet connection speed. If the issue persists, try clearing the app cache or re-loading the playlist. Large playlists may take longer to load on some devices.",
  },
  {
    question:
      '"Unable to Stream" Error sorry playlist not working . This message appears when there are restrictions on a playlist.',
    answer:
      "This error usually means the stream URL is broken, expired, or blocked by your ISP. Contact your playlist provider for a working link or use a VPN.",
  },
];

export default function FAQ() {
  const { t } = useI18n();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="py-16 sm:py-20 md:py-24 bg-black relative overflow-hidden"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-7xl">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-red-600/10 blur-[150px] rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-20">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4"
          >
            {t("Frequently Asked")}{" "}
            <span className="text-red-600">{t("Questions")}</span>
          </motion.h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            {t(
              "Everything you need to know about NOVA Player and its features.",
            )}
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className={`rounded-2xl border transition-all ${
                openIndex === index
                  ? "bg-white/10 border-red-500/50"
                  : "bg-white/5 border-white/10 hover:border-white/20"
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-6 text-left transition-colors"
              >
                <span
                  className={`text-lg font-bold pr-8 transition-colors ${
                    openIndex === index ? "text-red-500" : "text-white"
                  }`}
                >
                  {t(faq.question)}
                </span>
                <div
                  className={`shrink-0 transition-colors ${
                    openIndex === index ? "text-red-500" : "text-gray-500"
                  }`}
                >
                  {openIndex === index ? (
                    <Minus size={24} />
                  ) : (
                    <Plus size={24} />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-6 pb-6 text-gray-400 leading-relaxed border-t border-white/5 pt-4 mt-2 mx-6">
                      {t(faq.answer)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
