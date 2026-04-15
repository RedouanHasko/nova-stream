import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";

const COUNTRY_OPTIONS = [
  { code: "MA", name: "Morocco", dialCode: "+212", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", dialCode: "+213", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia", dialCode: "+216", flag: "🇹🇳" },
  { code: "EG", name: "Egypt", dialCode: "+20", flag: "🇪🇬" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", dialCode: "+965", flag: "🇰🇼" },
  { code: "TR", name: "Turkey", dialCode: "+90", flag: "🇹🇷" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "BE", name: "Belgium", dialCode: "+32", flag: "🇧🇪" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
] as const;

type CountryCode = (typeof COUNTRY_OPTIONS)[number]["code"];

interface PhoneNumberInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function normalizeDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

function getCountryByCode(code?: string | null) {
  return (
    COUNTRY_OPTIONS.find((country) => country.code === code) ||
    COUNTRY_OPTIONS[0]
  );
}

function detectCountryFromPhone(value: string) {
  const normalized = (value || "").trim();
  if (!normalized.startsWith("+")) return null;

  return (
    [...COUNTRY_OPTIONS]
      .sort((left, right) => right.dialCode.length - left.dialCode.length)
      .find((country) => normalized.startsWith(country.dialCode)) || null
  );
}

function detectBrowserCountryCode(): CountryCode {
  if (typeof navigator !== "undefined") {
    const language = navigator.languages?.[0] || navigator.language || "";
    const region = language.split("-")[1]?.toUpperCase();
    if (region && COUNTRY_OPTIONS.some((country) => country.code === region)) {
      return region as CountryCode;
    }
  }

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (timeZone.includes("Casablanca")) return "MA";
    if (timeZone.includes("Paris")) return "FR";
    if (timeZone.includes("Algiers")) return "DZ";
    if (timeZone.includes("Tunis")) return "TN";
    if (timeZone.includes("Cairo")) return "EG";
    if (timeZone.includes("Riyadh")) return "SA";
    if (timeZone.includes("Dubai")) return "AE";
    if (timeZone.includes("London")) return "GB";
    if (timeZone.includes("New_York") || timeZone.includes("Chicago")) {
      return "US";
    }
  } catch {
    // ignore browser detection failures
  }

  return "MA";
}

function splitPhoneValue(value: string, fallbackCode: CountryCode) {
  const detectedCountry =
    detectCountryFromPhone(value) || getCountryByCode(fallbackCode);
  const digits = normalizeDigits(value || "");
  const dialDigits = normalizeDigits(detectedCountry.dialCode);

  if (!digits) {
    return {
      countryCode: detectedCountry.code,
      localNumber: "",
    };
  }

  const localNumber = digits.startsWith(dialDigits)
    ? digits.slice(dialDigits.length)
    : digits;

  return {
    countryCode: detectedCountry.code,
    localNumber,
  };
}

export function PhoneNumberInput({
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = "600000000",
}: PhoneNumberInputProps) {
  const detectedCountryCode = useMemo(detectBrowserCountryCode, []);
  const initialState = splitPhoneValue(value || "", detectedCountryCode);
  const [selectedCountryCode, setSelectedCountryCode] = useState<CountryCode>(
    initialState.countryCode,
  );
  const [localNumber, setLocalNumber] = useState(initialState.localNumber);
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const countryMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextState = splitPhoneValue(
      value || "",
      selectedCountryCode || detectedCountryCode,
    );
    setSelectedCountryCode(nextState.countryCode);
    setLocalNumber(nextState.localNumber);
  }, [value, selectedCountryCode, detectedCountryCode]);

  useEffect(() => {
    if (!isCountryMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!countryMenuRef.current?.contains(event.target as Node)) {
        setIsCountryMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCountryMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCountryMenuOpen]);

  const selectedCountry = getCountryByCode(selectedCountryCode);

  const emitValue = (countryCode: CountryCode, rawLocalNumber: string) => {
    const country = getCountryByCode(countryCode);

    if ((rawLocalNumber || "").trim().startsWith("+")) {
      const parsed = splitPhoneValue(rawLocalNumber, country.code);
      setSelectedCountryCode(parsed.countryCode);
      setLocalNumber(parsed.localNumber);
      const parsedCountry = getCountryByCode(parsed.countryCode);
      const normalized = normalizeDigits(parsed.localNumber);
      onChange(normalized ? `${parsedCountry.dialCode}${normalized}` : "");
      return;
    }

    const normalized = normalizeDigits(rawLocalNumber);
    setLocalNumber(rawLocalNumber);
    onChange(normalized ? `${country.dialCode}${normalized}` : "");
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div ref={countryMenuRef} className="relative rounded-xl shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Globe2
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsCountryMenuOpen((open) => !open)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isCountryMenuOpen}
          aria-label="Country code"
          title={`${selectedCountry.name} (${selectedCountry.code}) ${selectedCountry.dialCode}`}
          className="flex w-full items-center justify-between rounded-xl border-0 bg-input py-2.5 pr-2.5 pl-10 text-left text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 disabled:cursor-not-allowed disabled:opacity-70 sm:text-xs sm:leading-6"
        >
          <span className="truncate font-medium">
            {selectedCountry.code} {selectedCountry.dialCode}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              isCountryMenuOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {isCountryMenuOpen ? (
          <div
            role="listbox"
            aria-label="Country list"
            className="absolute z-30 mt-2 max-h-72 min-w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-2xl sm:w-[320px]"
          >
            {COUNTRY_OPTIONS.map((country) => {
              const isSelected = country.code === selectedCountry.code;

              return (
                <button
                  key={`${country.code}-${country.dialCode}`}
                  type="button"
                  onClick={() => {
                    setSelectedCountryCode(country.code);
                    emitValue(country.code, localNumber);
                    setIsCountryMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span className="shrink-0">{country.flag}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {country.name} ({country.code})
                  </span>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {country.dialCode}
                  </span>
                  {isSelected ? (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <input
        id={id}
        name={name || id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        disabled={disabled}
        value={localNumber}
        onChange={(e) => emitValue(selectedCountry.code, e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-xl border-0 bg-input px-4 py-2.5 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
      />
    </div>
  );
}

export default PhoneNumberInput;
