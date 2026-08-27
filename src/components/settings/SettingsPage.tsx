import { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowLeftIcon,
  FolderIcon,
  SwatchIcon,
  FileExportIcon,
  KeyboardIcon,
  InfoIcon,
  IntegrationsIcon,
} from "../icons";
import { Button, IconButton } from "../ui";
import { GeneralSettingsSection } from "./GeneralSettingsSection";
import { AppearanceSettingsSection } from "./EditorSettingsSection";
import { ShortcutsSettingsSection } from "./ShortcutsSettingsSection";
import { AboutSettingsSection } from "./AboutSettingsSection";
import { ExportSettingsSection } from "./ExportSettingsSection";
import { getNotesFolder } from "../../services/notes";
import { ToolsSettingsSection } from "./ToolsSettingsSection";
import { keyIs, isWindows, mod, shortcut } from "../../lib/platform";

interface SettingsPageProps {
  onBack: () => void;
  // Folder tabs need NotesProvider/GitProvider, which only the notes window mounts.
  folderFeatures?: boolean;
}

type SettingsTab =
  | "general"
  | "tools"
  | "editor"
  | "export"
  | "shortcuts"
  | "about";

const allTabs: {
  id: SettingsTab;
  label: string;
  icon: typeof FolderIcon;
  shortcut: string;
  needsFolder?: boolean;
}[] = [
  { id: "general", label: "Folder", icon: FolderIcon, shortcut: "1", needsFolder: true },
  {
    id: "tools",
    label: "Integrations",
    icon: IntegrationsIcon,
    shortcut: "2",
    needsFolder: true,
  },
  { id: "editor", label: "Appearance", icon: SwatchIcon, shortcut: "3" },
  { id: "export", label: "Export", icon: FileExportIcon, shortcut: "4" },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, shortcut: "5" },
  { id: "about", label: "About", icon: InfoIcon, shortcut: "6" },
];

export function SettingsPage({
  onBack,
  folderFeatures = true,
}: SettingsPageProps) {
  const [hasFolder, setHasFolder] = useState<boolean | null>(null);
  const tabs = useMemo(
    () =>
      allTabs.filter(
        (tab) => !tab.needsFolder || (folderFeatures && hasFolder === true)
      ),
    [folderFeatures, hasFolder]
  );
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    folderFeatures ? "general" : "editor"
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getNotesFolder()
      .then((folder) => setHasFolder(!!folder))
      .catch(() => setHasFolder(false));
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  // Reset scroll position when tab changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const tab = tabs.find((candidate) => keyIs(e, candidate.shortcut));
        if (tab) {
          e.preventDefault();
          setActiveTab(tab.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="h-full flex bg-bg w-full">
      {/* Sidebar - matches main Notes sidebar */}
      <div className="w-64 h-full bg-bg-secondary border-r border-border flex flex-col select-none">
        {/* Drag region */}
        {!isWindows && <div className="h-11 shrink-0" data-tauri-drag-region></div>}

        {/* Header with back button and Settings title */}
        <div className={`flex items-center justify-between px-3 pb-2 border-b border-border shrink-0${isWindows ? " pt-2" : ""}`}>
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onBack}
              title={`Back (${shortcut(mod, ",")})`}
            >
              <ArrowLeftIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            </IconButton>
            <div className="font-medium text-base">Settings</div>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="justify-between gap-2.5 h-10 pr-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4.5 h-4.5 stroke-[1.5]" />
                  {tab.label}
                </div>
                <div className="text-xs text-text-muted">
                  {shortcut(mod, tab.shortcut)}
                </div>
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col bg-bg overflow-hidden">
        {/* Drag region */}
        {!isWindows && <div className="h-11 shrink-0" data-tauri-drag-region></div>}

        {/* Content - centered with max width */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto scrollbar-gutter-stable"
        >
          <div className={`w-full max-w-3xl mx-auto px-6 pb-6${isWindows ? " pt-2" : ""}`}>
            {activeTab === "general" && <GeneralSettingsSection />}
            {activeTab === "tools" && <ToolsSettingsSection />}
            {activeTab === "editor" && <AppearanceSettingsSection />}
            {activeTab === "export" && <ExportSettingsSection />}
            {activeTab === "shortcuts" && <ShortcutsSettingsSection />}
            {activeTab === "about" && <AboutSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
