import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Search } from "lucide-react";
import type { StatusSettings as Settings } from "@/lib/status-meta";

export interface Contact {
  id: string;
  name: string;
  dp?: string;
}

type Screen =
  | "overview"
  | "who"
  | "hideFrom"
  | "allowFor"
  | "oneTime"
  | "hideCaption"
  | "showCaption"
  | "advanced";

function Row({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value?: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b border-white/6 px-4 py-3.5 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {sub && <span className="mt-0.5 block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {value}
        <ChevronRight className="h-4 w-4" />
      </span>
    </button>
  );
}

function Toggle({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3.5">
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {sub && <span className="mt-0.5 block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

function ContactPicker({
  title,
  contacts,
  selected,
  note,
  onBack,
  onSave,
}: {
  title: string;
  contacts: Contact[];
  selected: string[];
  note?: string;
  onBack: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(selected);
  const [q, setQ] = useState("");
  const list = contacts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} aria-label="Back" className="text-foreground">
          <X className="h-5 w-5" />
        </button>
        <span className="font-heading text-base font-semibold">{title}</span>
      </header>
      <div className="px-4">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-secondary px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <ul className="mt-2 flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {list.length === 0 && (
          <li className="px-5 py-8 text-center text-xs text-muted-foreground">No contacts yet.</li>
        )}
        {list.map((c) => {
          const on = ids.includes(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => setIds((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/40 bg-secondary font-heading text-sm text-primary">
                  {c.dp ? <img src={c.dp} alt="" className="h-full w-full object-cover" /> : c.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 text-sm text-foreground">{c.name}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    on ? "border-primary bg-primary text-white" : "border-white/25"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {note && <p className="px-5 pb-2 text-center text-[11px] text-muted-foreground">{note}</p>}
      <div className="px-4 pb-6 pt-2">
        <p className="mb-3 text-center text-[11px] text-muted-foreground">{ids.length} contact{ids.length === 1 ? "" : "s"} selected</p>
        <button onClick={() => onSave(ids)} className="gold-btn w-full rounded-xl py-3 text-sm">
          Save
        </button>
      </div>
    </div>
  );
}

export function StatusSettingsSheet({
  settings,
  contacts,
  onChange,
  onClose,
}: {
  settings: Settings;
  contacts: Contact[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("overview");
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const name = (id: string) => contacts.find((c) => c.id === id)?.name ?? "1 contact";
  const nContacts = (arr: string[]) =>
    arr.length === 0 ? "None" : arr.length === 1 ? name(arr[0]) : `${arr.length} contacts`;

  return (
    <div className="fixed inset-0 z-[92] flex flex-col bg-[#050506]">
      {screen === "overview" && (
        <>
          <header className="flex items-center gap-3 px-4 py-4">
            <button onClick={onClose} aria-label="Close" className="text-foreground">
              <X className="h-5 w-5" />
            </button>
            <span className="font-heading text-base font-semibold">Status Settings</span>
          </header>
          <div className="flex-1 overflow-y-auto pb-8" style={{ scrollbarWidth: "none" }}>
            <p className="px-4 pb-2 pt-3 text-[11px] font-semibold tracking-widest text-primary">
              PRIVACY CONTROL
            </p>
            <Row
              label="Who can view my status"
              value={
                { everyone: "Everyone", contacts: "My contacts", except: "Except…", only: "Only share with…", custom: "Custom list" }[
                  settings.whoCanView
                ]
              }
              onClick={() => setScreen("who")}
            />
            <Row label="Hide status from" value={nContacts(settings.hiddenFrom)} onClick={() => setScreen("hideFrom")} />
            <Row label="Allow status for" value={nContacts(settings.allowFor)} onClick={() => setScreen("allowFor")} />
            <Row
              label="One-time view for"
              sub="They will never see it again after one view."
              value={nContacts(settings.oneTimeFor)}
              onClick={() => setScreen("oneTime")}
            />

            <p className="px-4 pb-2 pt-6 text-[11px] font-semibold tracking-widest text-primary">
              CAPTION CONTROL
            </p>
            <Row label="Hide caption from" value={nContacts(settings.captionHiddenFrom)} onClick={() => setScreen("hideCaption")} />
            <Row label="Show caption to" value={nContacts(settings.captionShowTo)} onClick={() => setScreen("showCaption")} />

            <p className="px-4 pb-2 pt-6 text-[11px] font-semibold tracking-widest text-primary">
              ADVANCED PRIVACY
            </p>
            <Row label="Advanced privacy" value="More options" onClick={() => setScreen("advanced")} />
            <Toggle
              label="Read receipts for status"
              on={settings.readReceipts}
              onChange={(v) => set({ readReceipts: v })}
            />
          </div>
        </>
      )}

      {screen === "who" && (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => setScreen("overview")} aria-label="Back" className="text-foreground">
              <X className="h-5 w-5" />
            </button>
            <span className="font-heading text-base font-semibold">Who can view my status</span>
          </header>
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            {(
              [
                { id: "everyone", label: "Everyone" },
                { id: "contacts", label: "My contacts" },
                { id: "except", label: "My contacts except…", sub: `${settings.hiddenFrom.length} excluded` },
                { id: "only", label: "Only share with…", sub: `${settings.allowFor.length} selected` },
                { id: "custom", label: "Custom list", sub: "Create your own list" },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  set({ whoCanView: o.id });
                  if (o.id === "except") setScreen("hideFrom");
                  else if (o.id === "only" || o.id === "custom") setScreen("allowFor");
                }}
                className="flex w-full items-center gap-3 border-b border-white/6 px-4 py-3.5 text-left"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    settings.whoCanView === o.id ? "border-primary" : "border-white/25"
                  }`}
                >
                  {settings.whoCanView === o.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-sm text-foreground">{o.label}</span>
                  {"sub" in o && o.sub && <span className="block text-[11px] text-muted-foreground">{o.sub}</span>}
                </span>
              </button>
            ))}

            <p className="px-4 pb-1 pt-6 text-xs text-muted-foreground">Additional Options</p>
            <Toggle label="Share with new contacts" on={settings.shareNewContacts} onChange={(v) => set({ shareNewContacts: v })} />
            <Toggle label="Share with people I chat with" on={settings.shareChatPeople} onChange={(v) => set({ shareChatPeople: v })} />
            <Toggle label="Allow forward" on={settings.allowForward} onChange={(v) => set({ allowForward: v })} />
          </div>
          <div className="px-4 pb-6 pt-3">
            <button onClick={() => setScreen("overview")} className="gold-btn w-full rounded-xl py-3 text-sm">
              Save
            </button>
          </div>
        </div>
      )}

      {screen === "hideFrom" && (
        <ContactPicker
          title="Hide status from"
          contacts={contacts}
          selected={settings.hiddenFrom}
          onBack={() => setScreen("overview")}
          onSave={(ids) => {
            set({ hiddenFrom: ids });
            setScreen("overview");
          }}
        />
      )}
      {screen === "allowFor" && (
        <ContactPicker
          title="Allow status for"
          contacts={contacts}
          selected={settings.allowFor}
          onBack={() => setScreen("overview")}
          onSave={(ids) => {
            set({ allowFor: ids });
            setScreen("overview");
          }}
        />
      )}
      {screen === "oneTime" && (
        <ContactPicker
          title="One-time view for"
          contacts={contacts}
          selected={settings.oneTimeFor}
          note="Will disappear after 1 view"
          onBack={() => setScreen("overview")}
          onSave={(ids) => {
            set({ oneTimeFor: ids });
            setScreen("overview");
          }}
        />
      )}
      {screen === "hideCaption" && (
        <ContactPicker
          title="Hide caption from"
          contacts={contacts}
          selected={settings.captionHiddenFrom}
          note="Selected people won't see the caption, but still see the status."
          onBack={() => setScreen("overview")}
          onSave={(ids) => {
            set({ captionHiddenFrom: ids });
            setScreen("overview");
          }}
        />
      )}
      {screen === "showCaption" && (
        <ContactPicker
          title="Show caption to"
          contacts={contacts}
          selected={settings.captionShowTo}
          note="Only selected people will see the caption."
          onBack={() => setScreen("overview")}
          onSave={(ids) => {
            set({ captionShowTo: ids });
            setScreen("overview");
          }}
        />
      )}

      {screen === "advanced" && (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => setScreen("overview")} aria-label="Back" className="text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-heading text-base font-semibold">Advanced Privacy</span>
          </header>
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <Toggle
              label="Block screenshots"
              sub="They won't be able to take screenshots."
              on={settings.blockScreenshots}
              onChange={(v) => set({ blockScreenshots: v })}
            />
            <Toggle
              label="Hide view count from others"
              sub="Others won't see how many views."
              on={settings.hideViewCount}
              onChange={(v) => set({ hideViewCount: v })}
            />
            <Toggle label="Hide reaction count" on={settings.hideReactionCount} onChange={(v) => set({ hideReactionCount: v })} />
            <Toggle label="Hide reply count" on={settings.hideReplyCount} onChange={(v) => set({ hideReplyCount: v })} />
            <Toggle
              label="Show typing when replying"
              on={settings.showTypingWhenReplying}
              onChange={(v) => set({ showTypingWhenReplying: v })}
            />
            <div className="flex items-center justify-between gap-3 border-b border-white/6 px-4 py-3.5">
              <span>
                <span className="block text-sm text-foreground">Auto-delete status after</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Status will be deleted automatically.
                </span>
              </span>
              <select
                value={settings.autoDeleteHours}
                onChange={(e) => set({ autoDeleteHours: Number(e.target.value) })}
                aria-label="Auto delete after"
                className="rounded-md border border-white/10 bg-secondary px-2 py-1 text-xs text-foreground outline-none"
              >
                {[1, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="px-4 pb-6 pt-3">
            <button onClick={() => setScreen("overview")} className="gold-btn w-full rounded-xl py-3 text-sm">
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}