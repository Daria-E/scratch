import { useEffect, useRef, useState } from "react";
import katex from "katex";
import { CheckIcon, XIcon } from "../icons";
import { IconButton } from "../ui";
import { katexMacros } from "./MathExtensions";

export interface MathEditorPopupProps {
  initialLatex: string;
  displayMode: boolean;
  onSubmit: (latex: string) => void;
  onCancel: () => void;
}

export const MathEditorPopup = ({
  initialLatex,
  displayMode,
  onSubmit,
  onCancel,
}: MathEditorPopupProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [latex, setLatex] = useState(initialLatex);

  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    preview.replaceChildren();
    if (!latex.trim()) {
      const placeholder = document.createElement("span");
      placeholder.className = "text-xs text-text-muted";
      placeholder.textContent = "Preview";
      preview.appendChild(placeholder);
      return;
    }

    try {
      katex.render(latex, preview, {
        throwOnError: false,
        displayMode,
        macros: katexMacros,
      });
    } catch {
      preview.replaceChildren();
      const error = document.createElement("span");
      error.className = "text-xs text-text-muted";
      error.textContent = "Invalid LaTeX";
      preview.appendChild(error);
    }
  }, [displayMode, latex]);

  const handleSubmit = () => {
    onSubmit(latex);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Tab") {
      e.stopPropagation();
    }
  };

  return (
    <div className="flex flex-col gap-1.5 bg-bg border border-border rounded-lg shadow-md p-1.5 w-84">
      <textarea
        ref={textareaRef}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter KaTeX expression..."
        className="w-full h-30 resize-y rounded-md border border-border bg-bg px-2.5 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div
        ref={previewRef}
        dir="ltr"
        className="flex min-h-16 max-h-40 items-center justify-center overflow-auto rounded-md border border-border bg-bg-muted px-3 py-2 text-text"
      />
      <div className="flex items-center justify-end gap-1 mr-0.5 mb-0.5">
        <IconButton
          type="button"
          onClick={handleSubmit}
          title="Apply (Cmd/Ctrl+Enter)"
          size="xs"
          variant="ghost"
        >
          <CheckIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>
        <IconButton
          type="button"
          onClick={onCancel}
          title="Cancel"
          size="xs"
          variant="ghost"
        >
          <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
        </IconButton>
      </div>
    </div>
  );
};
