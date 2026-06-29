import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";

import { sftp, type SftpFile } from "../lib/api";
import { useStore } from "../lib/store";
import type { SessionTab } from "../lib/types";

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

function parentPath(dir: string): string {
  if (dir === "/" || dir === "") return "/";
  const trimmed = dir.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function FileBrowser({ session }: { session: SessionTab }) {
  const id = session.sftpId!;
  const pushToast = useStore((s) => s.pushToast);
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<SftpFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const list = await sftp.list(id, target);
        setEntries(list);
        setPath(target);
      } catch (e) {
        pushToast("error", String(e));
      } finally {
        setLoading(false);
      }
    },
    [id, pushToast],
  );

  useEffect(() => {
    let cancelled = false;
    sftp
      .home(id)
      .then((home) => {
        if (!cancelled) void load(home || ".");
      })
      .catch(() => void load("."));
    return () => {
      cancelled = true;
    };
  }, [id, load]);

  async function download(file: SftpFile) {
    try {
      const local = await saveDialog({ defaultPath: file.name });
      if (!local) return;
      await sftp.download(id, file.path, local);
      pushToast("success", `Downloaded ${file.name}`);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  async function upload() {
    try {
      const local = await openDialog({ multiple: false });
      if (!local || typeof local !== "string") return;
      const name = local.split(/[/\\]/).pop() ?? "upload";
      await sftp.upload(id, local, joinPath(path, name));
      pushToast("success", `Uploaded ${name}`);
      void load(path);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  async function remove(file: SftpFile) {
    try {
      await sftp.remove(id, file.path, file.isDir);
      void load(path);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  async function createFolder() {
    if (!newFolder?.trim()) {
      setNewFolder(null);
      return;
    }
    try {
      await sftp.mkdir(id, joinPath(path, newFolder.trim()));
      setNewFolder(null);
      void load(path);
    } catch (e) {
      pushToast("error", String(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-900/40 px-3 py-2">
        <button
          className="btn-subtle p-1.5"
          onClick={() => void load(parentPath(path))}
          title="Up"
        >
          <ArrowUp size={15} />
        </button>
        <code className="flex-1 truncate rounded bg-ink-900/60 px-2 py-1 font-mono text-xs text-slate-400">
          {path || "/"}
        </code>
        <button
          className="btn-subtle p-1.5"
          onClick={() => void load(path)}
          title="Refresh"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          className="btn-subtle p-1.5"
          onClick={() => setNewFolder("")}
          title="New folder"
        >
          <FolderPlus size={15} />
        </button>
        <button className="btn-ghost" onClick={() => void upload()}>
          <Upload size={15} /> Upload
        </button>
      </div>

      {newFolder !== null && (
        <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
          <input
            autoFocus
            className="input"
            placeholder="New folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
              if (e.key === "Escape") setNewFolder(null);
            }}
          />
          <button className="btn-primary" onClick={() => void createFolder()}>
            Create
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={22} className="animate-spin text-brand-400" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {entries.map((file) => (
                <tr
                  key={file.path}
                  className="group border-b border-ink-800/60 hover:bg-ink-800/40"
                >
                  <td className="w-6 py-1.5 pl-3">
                    {file.isDir ? (
                      <Folder size={15} className="text-brand-400" />
                    ) : (
                      <FileIcon size={15} className="text-slate-500" />
                    )}
                  </td>
                  <td className="py-1.5">
                    {file.isDir ? (
                      <button
                        className="text-slate-200 hover:text-brand-400"
                        onClick={() => void load(file.path)}
                      >
                        {file.name}
                      </button>
                    ) : (
                      <span className="text-slate-300">{file.name}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-xs text-slate-500">
                    {file.isDir ? "" : humanSize(file.size)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <span className="inline-flex gap-1 opacity-0 group-hover:opacity-100">
                      {!file.isDir && (
                        <button
                          className="btn-subtle p-1 text-slate-400"
                          onClick={() => void download(file)}
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                      )}
                      <button
                        className="btn-subtle p-1 text-slate-400 hover:text-red-400"
                        onClick={() => void remove(file)}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    Empty directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
