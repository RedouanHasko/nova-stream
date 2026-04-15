import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Partners from "./components/Partners";
import ParentalControl from "./components/ParentalControl";
import Features from "./components/Features";
import Pricing from "./components/Pricing";
import Devices from "./components/Devices";
import FAQ from "./components/FAQ";
import Contact from "./components/Contact";
import Footer from "./components/Footer";
import DeviceActivation from "./components/DeviceActivation";
import ManagePlaylists from "./components/ManagePlaylists";
import SmartTVShowcase from "./components/SmartTVShowcase";
import StreamingShowcase from "./components/StreamingShowcase";
import {
  CookiePolicyPage,
  DownloadsPage,
  HelpCenterPage,
  PrivacyPolicyPage,
  RefundPolicyPage,
  ResellerPage,
  TermsOfServicePage,
} from "./components/ResourcePages";
import ScrollToTop from "./components/ScrollToTop";

function HomePage() {
  return (
    <main>
      <Hero />
      <Partners />
      <ParentalControl />
      <SmartTVShowcase />
      <StreamingShowcase />
      <Features />
      <Pricing />
      <Devices />
      <FAQ />
      <Contact />
    </main>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen font-sans relative overflow-x-clip">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute -top-20 left-[-10%] h-[520px] w-[520px] rounded-full bg-rose-600/20 blur-[120px]" />
          <div className="absolute top-[18%] right-[-10%] h-[520px] w-[520px] rounded-full bg-cyan-500/10 blur-[130px]" />
          <div className="absolute inset-0 opacity-[0.16] section-grid" />
        </div>
        <Navbar />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
          <Route path="/reseller" element={<ResellerPage />} />
          <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/legal/terms" element={<TermsOfServicePage />} />
          <Route path="/legal/refund" element={<RefundPolicyPage />} />
          <Route path="/legal/cookies" element={<CookiePolicyPage />} />
          <Route path="/device/activate" element={<DeviceActivation />} />
          <Route path="/device/playlists" element={<ManagePlaylists />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  );
}
