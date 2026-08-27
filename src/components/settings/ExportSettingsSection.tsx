import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button, Combobox, Input, Select } from "../ui";
import { ChevronRightIcon } from "../icons";
import { cn } from "../../lib/utils";
import type {
  ExportPreset,
  ExportSettings,
  PaperSize,
  TextDirection,
} from "../../types/note";
import {
  deleteExportPreset,
  listExportFonts,
  getActiveExportPreset,
  importExportTemplate,
  listExportPresets,
  saveExportPreset,
  setActiveExportPreset,
} from "../../services/pdf";

const DEFAULT_PRESET_NAME = "Default";

const paperSizeOptions: { value: PaperSize; label: string }[] = [
  { value: "a4", label: "A4" },
  { value: "letter", label: "Letter" },
  { value: "a5", label: "A5" },
];

const directionOptions: { value: TextDirection; label: string }[] = [
  { value: "auto", label: "Auto (per paragraph)" },
  { value: "ltr", label: "Left to right" },
  { value: "rtl", label: "Right to left" },
];

const headingNumberingOptions = [
  { value: "", label: "None" },
  { value: "1.", label: "1., 2., 3." },
  { value: "1.1", label: "1.1, 1.2" },
  { value: "I.", label: "I., II., III." },
];

const pageNumberFormatOptions = [
  { value: "1", label: "1" },
  { value: "1 / 1", label: "1 / 12" },
  { value: "i", label: "i, ii, iii" },
];

const equationNumberingOptions = [
  { value: "", label: "None" },
  { value: "(1)", label: "(1), (2)" },
];

const defaults: Required<
  Pick<
    ExportSettings,
    | "paperSize"
    | "marginMm"
    | "fontSizePt"
    | "lineSpacing"
    | "direction"
    | "pageNumbers"
    | "justify"
    | "hyphenate"
    | "paragraphSpacingEm"
    | "firstLineIndentEm"
    | "columns"
    | "footnoteSizePt"
  >
> = {
  paperSize: "a4",
  marginMm: 20,
  fontSizePt: 11,
  lineSpacing: 1,
  direction: "auto",
  pageNumbers: true,
  justify: false,
  hyphenate: false,
  paragraphSpacingEm: 1.2,
  firstLineIndentEm: 0,
  columns: 1,
  footnoteSizePt: 8,
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-text font-medium">
        {label}
        {hint && (
          <span className="block text-xs text-text-muted font-normal">
            {hint}
          </span>
        )}
      </label>
      <div className="w-40 shrink-0">{children}</div>
    </div>
  );
}

const numberFieldClass =
  "w-full h-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export function ExportSettingsSection() {
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fonts, setFonts] = useState<string[]>([]);

  const reload = useCallback(async () => {
    const [loaded, active] = await Promise.all([
      listExportPresets(),
      getActiveExportPreset(),
    ]);
    if (loaded.length === 0) {
      const seeded: ExportPreset = { name: DEFAULT_PRESET_NAME, settings: {} };
      await saveExportPreset(seeded);
      await setActiveExportPreset(seeded.name);
      setPresets([seeded]);
      setActiveName(seeded.name);
      return;
    }
    setPresets(loaded);
    setActiveName(active ?? loaded[0].name);
  }, []);

  useEffect(() => {
    listExportFonts()
      .then(setFonts)
      .catch((error) => console.error("Failed to list fonts:", error));
  }, []);

  useEffect(() => {
    reload().catch((error) => {
      console.error("Failed to load export presets:", error);
      toast.error("Failed to load export presets");
    });
  }, [reload]);

  const active = presets.find((preset) => preset.name === activeName);

  const persist = useCallback(
    async (preset: ExportPreset) => {
      setPresets((previous) =>
        previous.map((item) => (item.name === preset.name ? preset : item))
      );
      try {
        await saveExportPreset(preset);
      } catch (error) {
        console.error("Failed to save preset:", error);
        toast.error("Failed to save preset");
        await reload();
      }
    },
    [reload]
  );

  const update = useCallback(
    <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
      if (!active) return;
      void persist({
        ...active,
        settings: { ...active.settings, [key]: value },
      });
    },
    [active, persist]
  );

  const updateNumber = useCallback(
    (
      key: keyof ExportSettings,
      raw: string,
      min: number,
      max: number
    ) => {
      const parsed = parseFloat(raw);
      if (!Number.isFinite(parsed)) return;
      update(key, Math.min(Math.max(parsed, min), max) as never);
    },
    [update]
  );

  const selectPreset = useCallback(async (name: string) => {
    setActiveName(name);
    try {
      await setActiveExportPreset(name);
    } catch (error) {
      console.error("Failed to select preset:", error);
      toast.error("Failed to select preset");
    }
  }, []);

  const addPreset = useCallback(async () => {
    const base = active?.settings ?? {};
    let name = "New preset";
    let suffix = 2;
    while (presets.some((preset) => preset.name === name)) {
      name = `New preset ${suffix++}`;
    }
    const preset: ExportPreset = { name, settings: { ...base } };
    try {
      await saveExportPreset(preset);
      await reload();
      await selectPreset(name);
    } catch (error) {
      console.error("Failed to create preset:", error);
      toast.error("Failed to create preset");
    }
  }, [active, presets, reload, selectPreset]);

  const renamePreset = useCallback(
    async (name: string) => {
      if (!active || name.trim() === "" || name === active.name) return;
      if (presets.some((preset) => preset.name === name)) {
        toast.error("A preset with that name already exists");
        return;
      }
      try {
        await saveExportPreset({ ...active, name });
        await deleteExportPreset(active.name);
        await reload();
        await selectPreset(name);
      } catch (error) {
        console.error("Failed to rename preset:", error);
        toast.error("Failed to rename preset");
      }
    },
    [active, presets, reload, selectPreset]
  );

  const removePreset = useCallback(async () => {
    if (!active) return;
    try {
      await deleteExportPreset(active.name);
      await reload();
    } catch (error) {
      console.error("Failed to delete preset:", error);
      toast.error("Failed to delete preset");
    }
  }, [active, reload]);

  const importTemplate = useCallback(async () => {
    if (!active) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "Typst template", extensions: ["typ"] }],
    });
    if (typeof selected !== "string") return;

    try {
      const report = await importExportTemplate(selected);
      await persist({ ...active, templateFile: report.fileName });
      if (report.missingFonts.length > 0) {
        toast.warning(
          `Template uses fonts not installed here: ${report.missingFonts.join(", ")}`
        );
      } else {
        toast.success(`Template ${report.fileName} imported`);
      }
    } catch (error) {
      console.error("Failed to import template:", error);
      toast.error(typeof error === "string" ? error : "Template is not valid");
    }
  }, [active, persist]);

  const clearTemplate = useCallback(() => {
    if (!active) return;
    void persist({ ...active, templateFile: undefined });
  }, [active, persist]);

  if (!active) {
    return (
      <div className="p-6 text-sm text-text-muted">Loading export presets…</div>
    );
  }

  const settings = active.settings;
  const usingTemplate = Boolean(active.templateFile);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-medium">Presets</h2>
          <Button onClick={addPreset} variant="ghost" size="sm">
            New preset
          </Button>
        </div>

        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
          <Row label="Active preset" hint="Used unless a note names its own">
            <Select
              value={active.name}
              onChange={(e) => void selectPreset(e.target.value)}
              className="w-40"
            >
              {presets.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </Select>
          </Row>

          <Row label="Name">
            <Input
              defaultValue={active.name}
              key={active.name}
              onBlur={(e) => void renamePreset(e.target.value.trim())}
              className="w-full h-9"
            />
          </Row>

          <Row
            label="Per-note override"
            hint="Add exportPreset: <name> to a note's frontmatter"
          >
            <span className="block text-xs text-text-muted text-center">
              {presets.length} preset{presets.length === 1 ? "" : "s"}
            </span>
          </Row>

          {presets.length > 1 && (
            <div className="pt-1">
              <Button onClick={removePreset} variant="ghost" size="sm">
                Delete “{active.name}”
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-border border-dashed" />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-medium">Page &amp; type</h2>
        </div>

        {usingTemplate && (
          <p className="mb-3 text-sm text-text-muted">
            This preset uses the template{" "}
            <span className="text-text">{active.templateFile}</span>, which
            controls the page itself. The values below are still passed to it.
          </p>
        )}

        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
          <Row label="Paper size">
            <Select
              value={settings.paperSize ?? defaults.paperSize}
              onChange={(e) => update("paperSize", e.target.value as PaperSize)}
              className="w-40"
            >
              {paperSizeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Row>

          <Row label="Margin" hint="Millimetres on every side">
            <Input
              type="number"
              min="5"
              max="50"
              value={settings.marginMm ?? defaults.marginMm}
              onChange={(e) => updateNumber("marginMm", e.target.value, 5, 50)}
              className={numberFieldClass}
            />
          </Row>

          <Row label="Font size" hint="Points">
            <Input
              type="number"
              min="7"
              max="24"
              value={settings.fontSizePt ?? defaults.fontSizePt}
              onChange={(e) => updateNumber("fontSizePt", e.target.value, 7, 24)}
              className={numberFieldClass}
            />
          </Row>

          <Row
            label="Line spacing"
            hint="1 = single, 1.5 = one and a half, 2 = double"
          >
            <Input
              type="number"
              min="0.8"
              max="3"
              step="0.1"
              value={settings.lineSpacing ?? defaults.lineSpacing}
              onChange={(e) =>
                updateNumber("lineSpacing", e.target.value, 0.8, 3)
              }
              className={numberFieldClass}
            />
          </Row>

          <Row
            label="Font family"
            hint={
              fonts.length > 0
                ? `${fonts.length} available; blank uses the built-in serif`
                : "Blank uses the built-in serif"
            }
          >
            <Combobox
              value={settings.fontFamily ?? ""}
              options={fonts}
              placeholder="Search fonts…"
              emptyLabel="No installed font matches"
              onChange={(next) => update("fontFamily", next || undefined)}
            />
          </Row>

          <Row label="Text direction">
            <Select
              value={settings.direction ?? defaults.direction}
              onChange={(e) =>
                update("direction", e.target.value as TextDirection)
              }
              className="w-40"
            >
              {directionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Row>

          <Row label="Page numbers">
            <Select
              value={settings.pageNumbers === false ? "off" : "on"}
              onChange={(e) => update("pageNumbers", e.target.value === "on")}
              className="w-40"
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </Select>
          </Row>
        </div>
      </section>

      <section>
        <button
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex items-center gap-1.5 text-xl font-medium mb-3"
        >
          <ChevronRightIcon
            className={cn(
              "w-4 h-4 stroke-[1.5] transition-transform",
              advancedOpen && "rotate-90"
            )}
          />
          Advanced
        </button>

        {advancedOpen && (
          <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-2">
            <Row label="Justify text">
              <Select
                value={settings.justify ? "on" : "off"}
                onChange={(e) => update("justify", e.target.value === "on")}
                className="w-40"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </Select>
            </Row>

            <Row label="Hyphenate">
              <Select
                value={settings.hyphenate ? "on" : "off"}
                onChange={(e) => update("hyphenate", e.target.value === "on")}
                className="w-40"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </Select>
            </Row>

            <Row label="Paragraph spacing" hint="Multiples of the font size">
              <Input
                type="number"
                min="0"
                max="4"
                step="0.1"
                value={
                  settings.paragraphSpacingEm ?? defaults.paragraphSpacingEm
                }
                onChange={(e) =>
                  updateNumber("paragraphSpacingEm", e.target.value, 0, 4)
                }
                className={numberFieldClass}
              />
            </Row>

            <Row label="First line indent" hint="Multiples of the font size">
              <Input
                type="number"
                min="0"
                max="4"
                step="0.1"
                value={settings.firstLineIndentEm ?? defaults.firstLineIndentEm}
                onChange={(e) =>
                  updateNumber("firstLineIndentEm", e.target.value, 0, 4)
                }
                className={numberFieldClass}
              />
            </Row>

            <Row label="Heading numbers">
              <Select
                value={settings.headingNumbering ?? ""}
                onChange={(e) => update("headingNumbering", e.target.value)}
                className="w-40"
              >
                {headingNumberingOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Row>

            <Row label="Page number style">
              <Select
                value={settings.pageNumberFormat ?? "1"}
                onChange={(e) => update("pageNumberFormat", e.target.value)}
                className="w-40"
              >
                {pageNumberFormatOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Row>

            <Row label="Header text" hint="Centred on every page">
              <Input
                defaultValue={settings.headerText ?? ""}
                key={`${active.name}-header`}
                onBlur={(e) =>
                  update("headerText", e.target.value.trim() || undefined)
                }
                className="w-full h-9"
              />
            </Row>

            <Row
              label="Footer text"
              hint="Replaces the page number when set"
            >
              <Input
                defaultValue={settings.footerText ?? ""}
                key={`${active.name}-footer`}
                onBlur={(e) =>
                  update("footerText", e.target.value.trim() || undefined)
                }
                className="w-full h-9"
              />
            </Row>

            <Row label="Columns">
              <Input
                type="number"
                min="1"
                max="3"
                value={settings.columns ?? defaults.columns}
                onChange={(e) => updateNumber("columns", e.target.value, 1, 3)}
                className={numberFieldClass}
              />
            </Row>

            <Row label="Footnote size" hint="Points">
              <Input
                type="number"
                min="5"
                max="14"
                step="0.5"
                value={settings.footnoteSizePt ?? defaults.footnoteSizePt}
                onChange={(e) =>
                  updateNumber("footnoteSizePt", e.target.value, 5, 14)
                }
                className={numberFieldClass}
              />
            </Row>

            <Row label="Equation numbers">
              <Select
                value={settings.equationNumbering ?? ""}
                onChange={(e) => update("equationNumbering", e.target.value)}
                className="w-40"
              >
                {equationNumberingOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Row>
          </div>
        )}
      </section>

      <div className="border-t border-border border-dashed" />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-medium">Typst template</h2>
        </div>

        <div className="rounded-[10px] border border-border pl-4 py-3 pr-3 space-y-3">
          <p className="text-sm text-text-muted">
            A template takes over the whole layout. It is checked by compiling a
            test document before it is stored.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={importTemplate} variant="ghost" size="sm">
              Import template…
            </Button>
            {usingTemplate && (
              <Button onClick={clearTemplate} variant="ghost" size="sm">
                Use built-in instead
              </Button>
            )}
          </div>

          <Row label="Extra Typst code" hint="Applied before the document">
            <span className="block text-xs text-text-muted text-center">
              {settings.preamble ? "set" : "none"}
            </span>
          </Row>
          <textarea
            defaultValue={settings.preamble ?? ""}
            key={`${active.name}-preamble`}
            onBlur={(e) =>
              update("preamble", e.target.value.trim() || undefined)
            }
            spellCheck={false}
            rows={4}
            placeholder={'#set page(fill: luma(250))'}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-accent"
          />
        </div>
      </section>
    </div>
  );
}
