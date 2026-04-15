import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  getPublicApplications,
  resolveImageUrl,
  type PublicApp,
} from "../lib/api";
import { useI18n } from "../contexts/I18nContext";

export default function Partners() {
  const { t } = useI18n();
  const [applications, setApplications] = useState<PublicApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getPublicApplications()
      .then((apps) => {
        if (!active) return;
        setApplications(apps);
      })
      .catch((error) => {
        console.error("public applications showcase failed", error);
        if (!active) return;
        setApplications([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const cards =
    applications.length > 0
      ? applications
      : [
          {
            id: "coming-soon-1" as unknown as number,
            name: t("Coming Soon"),
            description: t(
              "More applications will appear here as they are published in the system.",
            ),
            logoUrl: null,
          },
        ];

  return (
    <section className="py-16 sm:py-20 md:py-28 bg-transparent relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/10 mb-6"
        >
          {t("Applications Catalog")}
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6"
        >
          {t("Explore Our")}{" "}
          <span className="text-red-600">{t("Our Applications")}</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-gray-300/85 max-w-2xl mx-auto text-lg mb-10 md:mb-14"
        >
          {t(
            "Applications available directly from our system, ready for activation across the NOVA experience.",
          )}
        </motion.p>

        {isLoading && (
          <p className="text-sm text-gray-500 mb-8">
            {t("Loading applications from the system...")}
          </p>
        )}

        {!isLoading && applications.length === 0 && (
          <p className="text-sm text-gray-500 mb-8">
            {t("No active applications published yet.")}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {cards.map((application, index) => {
            const isReal = typeof application.id === "number";
            const CardWrapper = ({
              children,
            }: {
              children: React.ReactNode;
            }) =>
              isReal && application.downloadUrl ? (
                <a
                  href={application.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {children}
                </a>
              ) : isReal ? (
                <Link to="/downloads" className="block">
                  {children}
                </Link>
              ) : (
                <div>{children}</div>
              );

            return (
              <motion.div
                key={`${application.id}-${index}`}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <CardWrapper>
                  <div
                    className={`relative min-h-[220px] border border-white/10 rounded-2xl flex flex-col items-center justify-center p-6 hover:border-rose-400/60 hover:-translate-y-0.5 transition-all glass-surface bg-white/5${
                      isReal ? " cursor-pointer" : ""
                    }`}
                  >
                    {isReal && application.downloadUrl && (
                      <ExternalLink className="absolute top-3 right-3 h-3.5 w-3.5 text-white/30" />
                    )}
                    {application.logoUrl ? (
                      <img
                        src={resolveImageUrl(application.logoUrl)}
                        alt={application.name}
                        className="h-16 w-16 rounded-2xl object-cover mb-4 border border-white/10 bg-black/20"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-2xl mb-4 border border-white/10 bg-red-600/10 flex items-center justify-center text-red-300 font-black text-lg">
                        {application.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="text-base font-semibold text-white text-center mb-2">
                      {application.name}
                    </div>
                    <div className="text-sm text-white/60 text-center leading-relaxed">
                      {application.description ||
                        t(
                          "More applications will appear here as they are published in the system.",
                        )}
                    </div>
                  </div>
                </CardWrapper>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
