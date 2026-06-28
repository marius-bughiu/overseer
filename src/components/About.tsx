import { Github, Globe, ShieldCheck } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

const REPO = "https://github.com/marius-bughiu/overseer";

export function About() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <section className="card p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-600/15 text-brand-400">
          <ShieldCheck size={28} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-100">Overseer</h2>
        <p className="mt-1 text-sm text-slate-400">
          A cross-platform Tailscale remote desktop manager. Discover every
          machine on your tailnet and connect over RDP or VNC — with credentials
          kept in an encrypted vault.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={() => openUrl(REPO)}>
            <Github size={16} /> Source
          </button>
          <button
            className="btn-ghost"
            onClick={() => openUrl("https://tailscale.com")}
          >
            <Globe size={16} /> Tailscale
          </button>
        </div>
      </section>

      <section className="card p-5 text-sm text-slate-400">
        <h3 className="mb-2 font-semibold text-slate-200">How it works</h3>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Overseer lists your tailnet's machines (API or local CLI).</li>
          <li>You pick a machine and a protocol (RDP or VNC).</li>
          <li>
            It builds the right launch artifact and hands it to your platform's
            remote desktop client over the secure Tailscale network.
          </li>
        </ol>
        <p className="mt-3">
          Passwords never leave the encrypted vault and are never embedded in
          launch URIs or files.
        </p>
      </section>
    </div>
  );
}
