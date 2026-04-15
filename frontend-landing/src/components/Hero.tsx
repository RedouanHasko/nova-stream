import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ArrowRight,
  ShieldCheck,
  Zap,
  MessageSquareQuote,
  MessageCircle,
  Send,
  Cpu,
  Sparkles,
  Bot,
  Loader2,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import { Link } from "react-router-dom";
import { useI18n } from "../contexts/I18nContext";

const geminiApiKey =
  (
    import.meta as { env?: { VITE_GEMINI_API_KEY?: string } }
  ).env?.VITE_GEMINI_API_KEY?.trim() || "";
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export default function Hero() {
  const { t } = useI18n();
  const [isDisclaimerExpanded, setIsDisclaimerExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "bot"; text: string }[]
  >([
    {
      role: "bot",
      text: t(
        "Hello! I'm **NOVA**, your dedicated AI assistant. How can I help you with **NOVA PLAYER** today?",
      ),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const botRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculateRotation = () => {
    if (!botRef.current) return { x: 0, y: 0 };
    const rect = botRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const angleX = (mousePos.y - centerY) * -0.1;
    const angleY = (mousePos.x - centerX) * 0.1;

    // Limit rotation
    return {
      x: Math.max(Math.min(angleX, 20), -20),
      y: Math.max(Math.min(angleY, 20), -20),
    };
  };

  const botRotation = calculateRotation();

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    if (!ai) {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: t(
            "AI assistant is not configured yet. Set `VITE_GEMINI_API_KEY` in your `.env` file to enable chat.",
          ),
        },
      ]);
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setIsTyping(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: `You are NOVA, the exclusive AI assistant for NOVA PLAYER. Your ONLY purpose is to provide information about NOVA PLAYER, its features, technical support, and activation process.

KNOWLEDGE BASE:
- APP NAME: NOVA PLAYER.
- PURPOSE: A high-performance media player and IPTV application for playing user-provided content.
- CONTENT POLICY: NOVA PLAYER DOES NOT provide channels, playlists, or subscriptions. Users must bring their own M3U playlists or Xtream Codes.
- PRICING:
  * Yearly Activation: €1.99 (1 Year full access, 4K UHD support, Multi-playlist support).
  * Lifetime Activation: €4.99 (Lifetime access, priority support, free future updates).
- FEATURES:
  * 4K UHD & 8K Support.
  * Multi-playlist support.
  * EPG (Electronic Program Guide) support.
  * Parental Control (PIN-based locking for channels/categories).
  * Favorites List management.
  * Advanced Subtitles & Audio track selection.
- COMPATIBILITY: Smart TVs (Samsung, LG, Sony, Android TV), Firestick, Android/iOS phones & tablets, Windows/Mac, Apple TV (tvOS), and Web Player.
- ACTIVATION PROCESS: Users need their MAC address and Device Key (found in app settings). Activation is instant after payment.
- TRIAL: 7-day free trial available for testing.
- REFUND POLICY: No refunds after purchase.

STRICT RULES:
1. ONLY answer questions related to NOVA PLAYER and the information above.
2. If a user asks about anything else (general knowledge, other apps, web search, etc.), politely decline and state that you are only authorized to discuss NOVA PLAYER.
3. Use Markdown for styling (bold, italics, lists) to make responses readable.
4. Keep responses concise, professional, and high-tech.
5. If asked about "subscriptions", clarify that we provide APP ACTIVATION (the player license), NOT content subscriptions.`,
        },
      });

      const botResponse =
        response.text ||
        t("I'm sorry, I couldn't process that. Please try again.");
      setMessages((prev) => [...prev, { role: "bot", text: botResponse }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: t(
            "Oops! Something went wrong. Please check your connection and try again.",
          ),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <section className="relative min-h-[100svh] flex items-center pt-20 sm:pt-24 overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop"
          alt="Modern TV Setup"
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(225,29,72,0.26),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.18),transparent_28%)]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <motion.div
          initial={{ opacity: 0, x: 30, y: 20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="hidden xl:flex absolute right-8 top-1/2 -translate-y-1/2 w-[380px] h-[240px] rounded-3xl glass-surface p-6 flex-col justify-between"
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-rose-200/90">
            {t("Playback Engine")}
          </div>
          <div>
            <p className="text-4xl font-bold text-white tracking-tight">
              4K / 8K
            </p>
            <p className="text-gray-300/85 mt-1">
              {t("Ultra-smooth adaptive streaming")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              <p className="text-white font-semibold">1.2M+</p>
              <p className="text-gray-400 text-xs">{t("Active users")}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 p-3">
              <p className="text-white font-semibold">99.9%</p>
              <p className="text-gray-400 text-xs">{t("Uptime")}</p>
            </div>
          </div>
        </motion.div>

        <div className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="inline-flex items-center rounded-full px-4 py-1.5 text-[11px] tracking-[0.25em] uppercase text-rose-200 border border-rose-500/35 bg-rose-500/15 mb-6">
              {t("Next Generation Media Player")}
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.03] mb-6 sm:mb-8 tracking-tight">
              {t("Redefining the")} <br />
              <span className="bg-gradient-to-r from-rose-500 via-red-400 to-orange-300 bg-clip-text text-transparent">
                {t("Future of Playback.")}
              </span>
            </h1>

            <p className="max-w-2xl text-base sm:text-lg md:text-xl text-white/90 mb-8 sm:mb-12 leading-relaxed font-medium">
              {t(
                "Step into the next era of media innovation. NOVA PLAYER is a high-performance masterpiece, engineered for those who demand pixel-perfect quality and lightning-fast streaming. Your content, your way, in stunning 4K clarity.",
              )}
            </p>

            <div className="flex flex-wrap gap-3 sm:gap-4">
              <Link
                to="/device/activate"
                className="w-full sm:w-auto bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl font-bold text-base sm:text-lg transition-all transform hover:scale-[1.03] active:scale-95 shadow-xl shadow-rose-600/35 flex items-center justify-center gap-2 group"
              >
                {t("ACTIVATE DEVICE")}
                <ArrowRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
              <Link
                to="/downloads"
                className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl font-bold text-base sm:text-lg transition-all transform hover:scale-[1.03] active:scale-95 backdrop-blur-sm border border-white/20 text-center"
              >
                {t("DOWNLOAD APP")}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-8 sm:mt-12">
              <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {t("1.2M+ Active Users")}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <ShieldCheck
                  size={12}
                  className="text-red-500 sm:w-[14px] sm:h-[14px]"
                />
                <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {t("Secured Activation")}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                <Zap
                  size={12}
                  className="text-red-500 sm:w-[14px] sm:h-[14px]"
                />
                <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {t("Instant Setup")}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Chat Window */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50, x: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50, x: 50 }}
            className="fixed bottom-4 sm:bottom-8 right-4 sm:right-8 z-50 w-[calc(100vw-32px)] sm:w-[400px] h-[500px] sm:h-[600px] max-h-[80vh] bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
          >
            {/* Chat Header */}
            <div className="p-4 bg-red-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold">
                    {t("NOVA Assistant")}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
                      {t("Online")}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                aria-label="Close assistant chat"
                title="Close assistant chat"
                className="text-white/80 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-red-600 text-white rounded-tr-none"
                        : "bg-white/5 text-white border border-white/10 rounded-tl-none"
                    }`}
                  >
                    {msg.role === "bot" ? (
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-red-500 prose-ul:list-disc prose-ul:pl-4">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/5 text-white border border-white/10 p-3 rounded-2xl rounded-tl-none">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 bg-white/5 border-t border-white/10 flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("Type your message...")}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-red-500 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                aria-label="Send chat message"
                title="Send chat message"
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-xl transition-all active:scale-95"
              >
                <Send size={20} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Disclaimer Box & Floating Buttons */}
      <AnimatePresence>
        {isDisclaimerExpanded ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20, y: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 100, y: 100 }}
            className="fixed bottom-8 right-8 z-40 max-w-md bg-red-950/95 border border-red-900/50 p-6 rounded-2xl shadow-2xl backdrop-blur-md"
          >
            <button
              onClick={() => setIsDisclaimerExpanded(false)}
              aria-label="Close legal disclaimer"
              title="Close legal disclaimer"
              className="absolute top-4 right-4 text-white/60 hover:text-white"
            >
              <X size={20} />
            </button>
            <div className="pr-8">
              <h4 className="text-red-500 font-bold text-sm mb-2 uppercase tracking-widest">
                {t("Legal Disclaimer")}
              </h4>
              <p className="text-white text-[13px] leading-relaxed font-medium">
                {t(
                  "NOVA PLAYER does not sell playlists or subscriptions. It is a video media player and does not offer channels or include any content. Clients must acquire content externally from our website. Please note, NOVA PLAYER is not responsible for the content utilized within our app. The app offers a 7-day trial period for testing purposes. After this period, a license must be purchased to continue using the app. Please be advised that there are no refunds after purchase.",
                )}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="fixed bottom-20 sm:bottom-24 right-4 sm:right-8 z-40 flex flex-col gap-3 sm:gap-4 items-center">
            {/* AI Chat Bot Button (NOVA Sentinel) */}
            <motion.div
              ref={botRef}
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                rotateX: botRotation.x,
                rotateY: botRotation.y,
              }}
              whileHover={{ scale: 1.1 }}
              onClick={() => setIsChatOpen(true)}
              className="relative group cursor-pointer perspective-1000"
            >
              {/* Dynamic Background Aura */}
              <div className="absolute inset-[-15px] sm:inset-[-20px] bg-red-600/20 rounded-full blur-[30px] sm:blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity duration-700 animate-pulse" />

              {/* Main Sentinel Body */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 relative z-10 flex items-center justify-center">
                {/* Outer Rotating Hexagon Frame */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-0 border-2 border-red-500/20 rounded-[30%] rotate-45"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  className="absolute inset-1.5 sm:inset-2 border border-dashed border-red-400/30 rounded-[35%]"
                />

                {/* The Prism Core */}
                <div className="w-11 h-11 sm:w-14 sm:h-14 relative preserve-3d">
                  {/* Glass Layers with Parallax */}
                  <motion.div
                    animate={{
                      x: botRotation.y * 0.8,
                      y: botRotation.x * -0.8,
                    }}
                    className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/30 shadow-2xl z-30"
                  />

                  <motion.div
                    animate={{
                      x: botRotation.y * 0.4,
                      y: botRotation.x * -0.4,
                    }}
                    className="absolute inset-1.5 sm:inset-2 bg-red-600/40 backdrop-blur-md rounded-lg sm:rounded-xl border border-red-400/50 z-20"
                  />

                  {/* The "Neural" Eye */}
                  <motion.div
                    animate={{
                      x: botRotation.y * 1.2,
                      y: botRotation.x * -1.2,
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      scale: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                    }}
                    className="absolute inset-0 flex items-center justify-center z-40"
                  >
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)] sm:shadow-[0_0_20px_rgba(255,255,255,1)] relative">
                      <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-50" />
                      <div className="absolute inset-[1.5px] sm:inset-[2px] bg-red-600 rounded-full" />
                    </div>
                  </motion.div>

                  {/* Internal Data Streams */}
                  <div className="absolute inset-0 z-10 overflow-hidden rounded-xl sm:rounded-2xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 via-transparent to-red-500/20 animate-scan" />
                  </div>
                </div>

                {/* Orbiting Satellites */}
                {[...Array(2)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      rotate: i === 0 ? 360 : -360,
                    }}
                    transition={{
                      duration: 5 + i * 2,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute inset-[-8px] sm:inset-[-10px]"
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                  </motion.div>
                ))}
              </div>

              {/* Floating Label */}
              <span className="absolute right-full mr-4 sm:mr-6 px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-900/90 backdrop-blur-xl border border-red-500/30 text-white text-[9px] sm:text-[11px] font-black rounded-xl opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 whitespace-nowrap shadow-[0_0_30px_rgba(239,68,68,0.2)] tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-2 sm:gap-3">
                <div className="flex gap-1">
                  <div
                    className="w-0.5 sm:w-1 h-2 sm:h-3 bg-red-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0s" }}
                  />
                  <div
                    className="w-0.5 sm:w-1 h-2 sm:h-3 bg-red-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <div
                    className="w-0.5 sm:w-1 h-2 sm:h-3 bg-red-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
                SENTINEL AI
              </span>
            </motion.div>

            {/* WhatsApp Button */}
            <motion.a
              href="mailto:support@novaplayer.com?subject=Support%20Request"
              initial={{ opacity: 0, scale: 0.5, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              whileHover={{ scale: 1.1 }}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] text-white rounded-full flex items-center justify-center shadow-2xl shadow-green-600/40 hover:brightness-110 transition-all group relative"
              aria-label="Email support"
              title="Email support"
            >
              <MessageCircle size={24} className="sm:w-[28px] sm:h-[28px]" />
              <span className="absolute right-full mr-4 px-3 py-1 bg-[#25D366] text-white text-[9px] sm:text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                EMAIL SUPPORT
              </span>
            </motion.a>

            {/* Telegram Button */}
            <motion.a
              href="/help"
              initial={{ opacity: 0, scale: 0.5, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              whileHover={{ scale: 1.1 }}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-[#0088cc] text-white rounded-full flex items-center justify-center shadow-2xl shadow-blue-600/40 hover:brightness-110 transition-all group relative"
              aria-label="Open help center"
              title="Open help center"
            >
              <Send size={20} className="sm:w-[24px] sm:h-[24px] ml-[-2px]" />
              <span className="absolute right-full mr-4 px-3 py-1 bg-[#0088cc] text-white text-[9px] sm:text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                HELP CENTER
              </span>
            </motion.a>

            {/* Legal Info Button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.5, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              whileHover={{ scale: 1.1 }}
              onClick={() => setIsDisclaimerExpanded(true)}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-600/40 hover:bg-red-700 transition-all group relative"
            >
              <MessageSquareQuote
                size={24}
                className="sm:w-[28px] sm:h-[28px]"
              />
              <span className="absolute right-full mr-4 px-3 py-1 bg-red-600 text-white text-[9px] sm:text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                LEGAL INFO
              </span>
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
