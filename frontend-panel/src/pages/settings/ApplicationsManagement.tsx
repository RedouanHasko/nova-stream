import { useState, useEffect } from "react";
import { Plus, Trash2, Edit3, Save, X, Image as ImageIcon } from "lucide-react";
import { ConfirmModal } from "../../components/common/ConfirmModal";
import { FeedbackModal } from "../../components/common/FeedbackModal";
import api from "../../lib/api";

export function ApplicationsManagement() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [appToDelete, setAppToDelete] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    logoUrl: "",
    description: "",
    downloadUrl: "",
  });
  const [saveIntent, setSaveIntent] = useState<number | "new" | null>(null);
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: "success" | "error" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    variant: "info",
  });

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      const data = await api.getApplications();
      setApps(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (id?: number) => {
    if (!formData.name.trim()) {
      setFeedback({
        isOpen: true,
        title: "Missing application name",
        message: "Please enter an application name before saving.",
        variant: "info",
      });
      return;
    }
    try {
      if (id) {
        await api.updateApplication(id, formData);
        setFeedback({
          isOpen: true,
          title: "Application updated",
          message: "Application updated successfully.",
          variant: "success",
        });
      } else {
        await api.createApplication(formData);
        setFeedback({
          isOpen: true,
          title: "Application created",
          message: "Application created successfully.",
          variant: "success",
        });
      }
      setFormData({ name: "", logoUrl: "", description: "", downloadUrl: "" });
      setIsAdding(false);
      setEditingId(null);
      fetchApps();
    } catch (e: any) {
      setFeedback({
        isOpen: true,
        title: "Save failed",
        message: e?.message || "Failed to save the application.",
        variant: "error",
      });
    }
  };

  const handleDelete = (id: number) => {
    setAppToDelete(id);
  };

  const confirmDelete = async () => {
    if (appToDelete === null) return;
    try {
      await api.deleteApplication(appToDelete);
      setFeedback({
        isOpen: true,
        title: "Application deleted",
        message: "Application deleted successfully.",
        variant: "success",
      });
      fetchApps();
    } catch (e: any) {
      setFeedback({
        isOpen: true,
        title: "Delete failed",
        message: e?.message || "Delete failed",
        variant: "error",
      });
    } finally {
      setAppToDelete(null);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const res = await api.uploadImage(file);
      if (res && res.url) {
        setFormData({ ...formData, logoUrl: res.url });
      }
    } catch (e: any) {
      setFeedback({
        isOpen: true,
        title: "Upload failed",
        message: e?.message || "Upload failed",
        variant: "error",
      });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Applications Management
          </h1>
          <p className="text-muted-foreground">
            Manage dynamic applications available for device activation.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => {
              setIsAdding(true);
              setFormData({
                name: "",
                logoUrl: "",
                description: "",
                downloadUrl: "",
              });
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90 transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Application
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="mb-8 p-6 rounded-2xl bg-card border border-border shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Application" : "New Application"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">App Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full rounded-xl border-border bg-input py-2.5 px-4 focus:ring-2 focus:ring-foreground/20 sm:text-sm"
                placeholder="e.g. My Custom App"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Logo</label>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-foreground/5 border border-border flex items-center justify-center overflow-hidden">
                  {formData.logoUrl ? (
                    <img
                      src={api.resolveImageUrl(formData.logoUrl)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files?.[0] && handleLogoUpload(e.target.files[0])
                  }
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-foreground/5 file:text-foreground hover:file:bg-foreground/10"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full rounded-xl border-border bg-input py-2.5 px-4 focus:ring-2 focus:ring-foreground/20 sm:text-sm"
                rows={3}
                placeholder="Brief description of the app..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">
                Download URL
              </label>
              <input
                type="url"
                value={formData.downloadUrl}
                onChange={(e) =>
                  setFormData({ ...formData, downloadUrl: e.target.value })
                }
                className="w-full rounded-xl border-border bg-input py-2.5 px-4 focus:ring-2 focus:ring-foreground/20 sm:text-sm"
                placeholder="https://example.com/download/myapp"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Link where users can download this app. Leave empty to send
                users to the general downloads page.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-border hover:bg-foreground/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!formData.name.trim()) {
                  setFeedback({
                    isOpen: true,
                    title: "Missing application name",
                    message:
                      "Please enter an application name before continuing.",
                    variant: "info",
                  });
                  return;
                }
                setSaveIntent(editingId ? editingId : "new");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              <Save className="h-4 w-4" />
              Save Application
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <div
              key={app.id}
              className="group relative p-6 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-foreground/5 flex items-center justify-center overflow-hidden border border-border group-hover:scale-105 transition-transform">
                  {app.logoUrl ? (
                    <img
                      src={api.resolveImageUrl(app.logoUrl)}
                      alt={app.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold truncate text-foreground">
                    {app.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {app.description || "No description provided."}
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${app.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}
                >
                  {app.status}
                </span>
                {app.downloadUrl && (
                  <a
                    href={app.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors truncate max-w-[120px]"
                    title={app.downloadUrl}
                  >
                    Download link ↗
                  </a>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingId(app.id);
                      setFormData({
                        name: app.name,
                        logoUrl: app.logoUrl || "",
                        description: app.description || "",
                        downloadUrl: app.downloadUrl || "",
                      });
                      setIsAdding(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-all"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(app.id)}
                    className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5 rounded-lg transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {apps.length === 0 && !isAdding && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl">
              <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground">
                No applications found
              </h3>
              <p className="text-muted-foreground mb-6">
                Start by adding your first application above.
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={saveIntent !== null}
        onClose={() => setSaveIntent(null)}
        onConfirm={() => {
          const targetId =
            saveIntent === "new" ? undefined : (saveIntent ?? undefined);
          setSaveIntent(null);
          handleSave(targetId);
        }}
        title={
          saveIntent === "new"
            ? "Create application?"
            : "Save application changes?"
        }
        message={
          saveIntent === "new"
            ? "Are you sure you want to create this application?"
            : "Are you sure you want to save these application changes?"
        }
        confirmLabel={saveIntent === "new" ? "Create" : "Save changes"}
      />

      <ConfirmModal
        isOpen={appToDelete !== null}
        onClose={() => setAppToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete application?"
        message="Are you sure you want to delete this application? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      <FeedbackModal
        isOpen={feedback.isOpen}
        onClose={() =>
          setFeedback((current) => ({ ...current, isOpen: false }))
        }
        title={feedback.title}
        message={feedback.message}
        variant={feedback.variant}
      />
    </div>
  );
}
