import { useEffect, useState } from "react";
import {
  PlusCircle,
  ShieldCheck,
  Link as LinkIcon,
  KeyRound,
  User,
  List,
  Loader2,
  Layers,
} from "lucide-react";
import { formatMAC } from "../../../lib/utils";
import api from "../../../lib/api";
import { useI18n } from "../../../contexts/I18nContext";

interface AppItem {
  id: number;
  name: string;
}

export function AddPlaylist() {
  const { t } = useI18n();
  const [playlistType, setPlaylistType] = useState<"m3u" | "xtream">("m3u");
  const [mac, setMac] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [name, setName] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const catalog = await api.getAppCatalog();
        if (mounted && Array.isArray(catalog)) {
          setApps(catalog);
        }
      } catch (error) {
        console.error("Failed to load app catalog", error);
      } finally {
        if (mounted) setCatalogLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    setMessage(null);
    if (!mac || !name)
      return setMessage(t("MAC and playlist name are required"));
    if (!applicationId)
      return setMessage(t("Choose which app should receive this playlist"));
    if (playlistType === "m3u" && !m3uUrl.trim()) {
      return setMessage(t("Enter a valid M3U URL"));
    }
    if (
      playlistType === "xtream" &&
      (!host.trim() || !username.trim() || !password.trim())
    ) {
      return setMessage(t("Enter the Xtream host, username, and password"));
    }

    setLoading(true);
    try {
      const payload: any = { mac, name, applicationId };
      if (playlistType === "m3u") {
        payload.url = m3uUrl.trim();
      } else {
        payload.credentials = {
          host: host.trim(),
          username: username.trim(),
          password: password.trim(),
        };
      }
      const res = await api.assignPlaylistToDevice(payload);
      setMessage(res?.message || t("Playlist assigned successfully"));
      // Reset form
      setM3uUrl("");
      setHost("");
      setUsername("");
      setPassword("");
      setName("");
      setApplicationId("");
    } catch (e: any) {
      setMessage(e?.message || t("Failed to assign playlist"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
        <div className="border-b border-border px-6 py-5 bg-foreground/5">
          <h2 className="text-base font-semibold leading-6 text-foreground flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-emerald-500" />
            {t("Add Playlist")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Upload M3U URLs or Xtream Codes credentials to a specific MAC address.",
            )}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* MAC Address */}
          <div>
            <label
              htmlFor="mac"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("MAC Address")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <ShieldCheck
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="mac"
                id="mac"
                value={mac}
                onChange={(e) => setMac(formatMAC(e.target.value))}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6 font-mono uppercase"
                placeholder="XX:XX:XX:XX:XX:XX"
              />
            </div>
          </div>

          {/* Target Application */}
          <div>
            <label
              htmlFor="target-application"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("Target Application")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Layers
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <select
                id="target-application"
                name="target-application"
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 pr-3 text-foreground ring-1 ring-inset ring-border focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
              >
                <option value="">
                  {catalogLoading
                    ? t("Loading apps...")
                    : t("Select the app to update")}
                </option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "The playlist will be linked to this app for the selected MAC address.",
              )}
            </p>
          </div>

          {/* Playlist Name */}
          <div>
            <label
              htmlFor="playlist-name"
              className="block text-sm font-medium leading-6 text-foreground"
            >
              {t("Playlist Name")}
            </label>
            <div className="mt-2 relative rounded-xl shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <List
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <input
                type="text"
                name="playlist-name"
                id="playlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                placeholder={t("e.g., Premium Sports, Movies List")}
              />
            </div>
          </div>

          {/* Type Toggle */}
          <div>
            <label className="block text-sm font-medium leading-6 text-foreground mb-2">
              {t("Playlist Type")}
            </label>
            <div className="flex rounded-xl shadow-sm ring-1 ring-inset ring-border bg-foreground/5 p-1 w-fit">
              <button
                type="button"
                onClick={() => setPlaylistType("m3u")}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  playlistType === "m3u"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("M3U Link")}
              </button>
              <button
                type="button"
                onClick={() => setPlaylistType("xtream")}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  playlistType === "xtream"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("Xtream Codes")}
              </button>
            </div>
          </div>

          {/* Dynamic Fields based on Type */}
          <div className="bg-foreground/5 p-4 rounded-xl ring-1 ring-inset ring-border">
            {playlistType === "m3u" ? (
              <div>
                <label
                  htmlFor="m3u-url"
                  className="block text-sm font-medium leading-6 text-foreground"
                >
                  {t("M3U URL")}
                </label>
                <div className="mt-2 relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <LinkIcon
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <input
                    type="url"
                    name="m3u-url"
                    id="m3u-url"
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                    placeholder="http://example.com/get.php?username=...&password=...&type=m3u"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="host"
                    className="block text-sm font-medium leading-6 text-foreground"
                  >
                    {t("Host URL / Portal")}
                  </label>
                  <div className="mt-2 relative rounded-xl shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <LinkIcon
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <input
                      type="url"
                      name="host"
                      id="host"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                      placeholder="http://example.com:8080"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="username"
                      className="block text-sm font-medium leading-6 text-foreground"
                    >
                      {t("Username")}
                    </label>
                    <div className="mt-2 relative rounded-xl shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <User
                          className="h-5 w-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <input
                        type="text"
                        name="username"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium leading-6 text-foreground"
                    >
                      {t("Password")}
                    </label>
                    <div className="mt-2 relative rounded-xl shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <KeyRound
                          className="h-5 w-5 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <input
                        type="password"
                        name="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-xl border-0 bg-input py-2.5 pl-10 text-foreground ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-foreground/20 sm:text-sm sm:leading-6"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="bg-foreground/5 px-6 py-4 flex items-center justify-between border-t border-border">
          <div className="text-sm">
            {message && (
              <span
                className={
                  message.includes("successfully")
                    ? "text-emerald-500"
                    : "text-rose-500"
                }
              >
                {message}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={handleSave}
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:bg-foreground/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground gap-2 transition-all disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {loading ? t("Saving...") : t("Save Playlist")}
          </button>
        </div>
      </div>
    </div>
  );
}
