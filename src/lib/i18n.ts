/**
 * Lightweight, dependency-free internationalization.
 *
 * Strings are looked up by key in a per-language catalog and fall back to
 * English when a key (or whole language) is missing, so the UI never shows a
 * raw key. Components read the active language from the store via {@link useT}.
 */
import { useMemo } from "react";

import { useStore } from "./store";

export type Language = "en" | "es" | "de" | "fr";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
];

type Catalog = Record<string, string>;

const en: Catalog = {
  "nav.machines": "Machines",
  "nav.overview": "Overview",
  "nav.settings": "Settings",
  "nav.about": "About",
  "action.refresh": "Refresh",
  "action.connect": "Connect",
  "action.cancel": "Cancel",
  "vault.locked": "Vault locked",
  "vault.unlocked": "Vault unlocked",
  "vault.lock": "Lock",
  "vault.unlock": "Unlock",
  "settings.discovery": "Discovery",
  "settings.security": "Security",
  "settings.language": "Language",
  "settings.language.desc": "Choose the language for Overseer's interface.",
  "settings.backup": "Backup & restore",
  "settings.snippets": "Command snippets",
  "settings.importCreds": "Import credentials",
  "settings.clients": "Remote desktop clients",
  "settings.recent": "Recent connections",
};

const es: Catalog = {
  "nav.machines": "Máquinas",
  "nav.overview": "Vista general",
  "nav.settings": "Ajustes",
  "nav.about": "Acerca de",
  "action.refresh": "Actualizar",
  "action.connect": "Conectar",
  "action.cancel": "Cancelar",
  "vault.locked": "Bóveda bloqueada",
  "vault.unlocked": "Bóveda desbloqueada",
  "vault.lock": "Bloquear",
  "vault.unlock": "Desbloquear",
  "settings.discovery": "Descubrimiento",
  "settings.security": "Seguridad",
  "settings.language": "Idioma",
  "settings.language.desc": "Elige el idioma de la interfaz de Overseer.",
  "settings.backup": "Copia de seguridad y restauración",
  "settings.snippets": "Fragmentos de comandos",
  "settings.importCreds": "Importar credenciales",
  "settings.clients": "Clientes de escritorio remoto",
  "settings.recent": "Conexiones recientes",
};

const de: Catalog = {
  "nav.machines": "Maschinen",
  "nav.overview": "Übersicht",
  "nav.settings": "Einstellungen",
  "nav.about": "Über",
  "action.refresh": "Aktualisieren",
  "action.connect": "Verbinden",
  "action.cancel": "Abbrechen",
  "vault.locked": "Tresor gesperrt",
  "vault.unlocked": "Tresor entsperrt",
  "vault.lock": "Sperren",
  "vault.unlock": "Entsperren",
  "settings.discovery": "Erkennung",
  "settings.security": "Sicherheit",
  "settings.language": "Sprache",
  "settings.language.desc": "Wähle die Sprache der Overseer-Oberfläche.",
  "settings.backup": "Sicherung & Wiederherstellung",
  "settings.snippets": "Befehls-Snippets",
  "settings.importCreds": "Anmeldedaten importieren",
  "settings.clients": "Remote-Desktop-Clients",
  "settings.recent": "Letzte Verbindungen",
};

const fr: Catalog = {
  "nav.machines": "Machines",
  "nav.overview": "Vue d'ensemble",
  "nav.settings": "Paramètres",
  "nav.about": "À propos",
  "action.refresh": "Actualiser",
  "action.connect": "Connecter",
  "action.cancel": "Annuler",
  "vault.locked": "Coffre verrouillé",
  "vault.unlocked": "Coffre déverrouillé",
  "vault.lock": "Verrouiller",
  "vault.unlock": "Déverrouiller",
  "settings.discovery": "Découverte",
  "settings.security": "Sécurité",
  "settings.language": "Langue",
  "settings.language.desc": "Choisissez la langue de l'interface d'Overseer.",
  "settings.backup": "Sauvegarde et restauration",
  "settings.snippets": "Extraits de commandes",
  "settings.importCreds": "Importer des identifiants",
  "settings.clients": "Clients de bureau à distance",
  "settings.recent": "Connexions récentes",
};

const CATALOGS: Record<Language, Catalog> = { en, es, de, fr };

/** Translate a key for a language, falling back to English then the key itself. */
export function translate(lang: Language, key: string): string {
  return CATALOGS[lang]?.[key] ?? en[key] ?? key;
}

/** Hook returning a translator bound to the active UI language. */
export function useT(): (key: string) => string {
  const lang = useStore((s) => s.settings.language);
  return useMemo(() => (key: string) => translate(lang, key), [lang]);
}
