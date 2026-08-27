import { keyIs } from "../lib/platform";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { TooltipProvider, Toaster } from "./ui";
import { ErrorBoundary } from "./ErrorBoundary";
import { KeyboardShortcutsModal } from "./shortcuts/KeyboardShortcutsModal";

interface WindowShellContextValue {
  openShortcutsModal: () => void;
}

const WindowShellContext = createContext<WindowShellContextValue | null>(null);

export function useWindowShell(): WindowShellContextValue {
  const context = useContext(WindowShellContext);
  if (!context) {
    throw new Error("useWindowShell must be used within a WindowShell");
  }
  return context;
}

function WindowChrome({ children }: { children: ReactNode }) {
  const { interfaceZoom, setInterfaceZoom } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  interfaceZoomRef.current = interfaceZoom;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openShortcutsModal = useCallback(() => setShortcutsOpen(true), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;

      if (keyIs(e, "=") || keyIs(e, "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom =
          Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, {
          id: "zoom",
          duration: 1500,
        });
        return;
      }

      if (keyIs(e, "-") || keyIs(e, "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom =
          Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, {
          id: "zoom",
          duration: 1500,
        });
        return;
      }

      if (keyIs(e, "0")) {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      if (keyIs(e, "/")) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setInterfaceZoom]);

  return (
    <WindowShellContext.Provider value={{ openShortcutsModal }}>
      {children}
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </WindowShellContext.Provider>
  );
}

export function WindowShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <ErrorBoundary>
          <WindowChrome>{children}</WindowChrome>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  );
}
