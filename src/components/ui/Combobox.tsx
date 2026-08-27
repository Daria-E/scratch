import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface ComboboxProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel = "No matches",
  className,
}: ComboboxProps) {
  const [draft, setDraft] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const matches = useMemo(() => {
    const needle = draft.trim().toLowerCase();
    if (needle === "") return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [draft, options]);

  const commit = (next: string) => {
    setDraft(next);
    setIsOpen(false);
    if (next !== value) onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setHighlighted((current) => {
        if (matches.length === 0) return 0;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit(isOpen && matches[highlighted] ? matches[highlighted] : draft.trim());
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      setDraft(value);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setHighlighted(0);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => commit(draft.trim())}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="w-full h-9 rounded-md border border-border bg-bg px-3 text-sm text-text outline-none focus:border-accent"
      />

      {isOpen && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-bg py-1 shadow-lg">
          {matches.length === 0 && (
            <li className="px-3 py-1.5 text-sm text-text-muted">{emptyLabel}</li>
          )}
          {matches.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "block w-full px-3 py-1.5 text-start text-sm text-text",
                  index === highlighted && "bg-bg-muted"
                )}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
