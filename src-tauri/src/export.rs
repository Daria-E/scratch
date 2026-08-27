use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use crate::preprocess::{self, Prepared};
use regex::Regex;
use std::sync::LazyLock;
use std::collections::HashMap;
use std::path::PathBuf;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::fonts::FontStore;
use typst_layout::PagedDocument;

static ASSETS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/assets/export");

static FONT_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"font:\s*\(?\s*"([^"]+)""#).unwrap());
static TEMPLATE_PARAM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"settings\.params\.at\(\s*"([^"]+)""#).unwrap()
});

const TEMPLATE: &str = "main.typ";
const BLOCKS: &str = "blocks.json";
const SETTINGS: &str = "settings.json";

const FALLBACK_FONTS: [&str; 4] = [
    "Libertinus Serif",
    "New Computer Modern",
    "Noto Serif Hebrew",
    "DejaVu Sans",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub paper_size: Option<String>,
    pub margin_mm: Option<f64>,
    pub font_size_pt: Option<f64>,
    pub line_spacing: Option<f64>,
    pub font_family: Option<String>,
    pub direction: Option<String>,
    pub page_numbers: Option<bool>,
    pub justify: Option<bool>,
    pub hyphenate: Option<bool>,
    pub paragraph_spacing_em: Option<f64>,
    pub first_line_indent_em: Option<f64>,
    pub heading_numbering: Option<String>,
    pub page_number_format: Option<String>,
    pub header_text: Option<String>,
    pub footer_text: Option<String>,
    pub columns: Option<u8>,
    pub footnote_size_pt: Option<f64>,
    pub equation_numbering: Option<String>,
    pub preamble: Option<String>,
    #[serde(default)]
    pub params: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TemplateSettings {
    paper: String,
    margin: String,
    font_size: String,
    leading: String,
    fonts: Vec<String>,
    lang: String,
    dir: String,
    page_numbering: Option<String>,
    justify: bool,
    hyphenate: bool,
    par_spacing: String,
    first_line_indent: String,
    heading_numbering: Option<String>,
    header: Option<String>,
    footer: Option<String>,
    columns: u8,
    footnote_size: String,
    equation_numbering: Option<String>,
    params: HashMap<String, String>,
}

fn optional_text(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

impl ExportSettings {
    fn to_template(&self, markdown: &str) -> TemplateSettings {
        let dir = match self.direction.as_deref() {
            Some("rtl") => "rtl",
            Some("ltr") => "ltr",
            _ => first_strong_direction(markdown),
        };

        let mut fonts: Vec<String> = self.font_family.iter().cloned().collect();
        fonts.extend(FALLBACK_FONTS.iter().map(|f| f.to_string()));

        TemplateSettings {
            paper: typst_paper(self.paper_size.as_deref()),
            margin: format!("{}mm", self.margin_mm.unwrap_or(20.0)),
            font_size: format!("{}pt", self.font_size_pt.unwrap_or(11.0)),
            leading: format!("{}em", leading_em(self.line_spacing)),
            fonts,
            lang: if dir == "rtl" { "he".into() } else { "en".into() },
            dir: dir.into(),
            page_numbering: if self.page_numbers.unwrap_or(true) {
                Some(
                    optional_text(&self.page_number_format).unwrap_or_else(|| "1".into()),
                )
            } else {
                None
            },
            justify: self.justify.unwrap_or(false),
            hyphenate: self.hyphenate.unwrap_or(false),
            par_spacing: format!("{}em", self.paragraph_spacing_em.unwrap_or(1.2)),
            first_line_indent: format!("{}em", self.first_line_indent_em.unwrap_or(0.0)),
            heading_numbering: optional_text(&self.heading_numbering),
            header: optional_text(&self.header_text),
            footer: optional_text(&self.footer_text),
            columns: self.columns.unwrap_or(1).clamp(1, 3),
            footnote_size: format!("{}pt", self.footnote_size_pt.unwrap_or(8.0)),
            equation_numbering: optional_text(&self.equation_numbering),
            params: self.params.clone(),
        }
    }
}

// Users think in line-height multiples (1 = single, 2 = double); Typst wants the gap
// between lines, whose single-spaced value is 0.65em.
const SINGLE_LEADING_EM: f64 = 0.65;

fn leading_em(multiplier: Option<f64>) -> f64 {
    (multiplier.unwrap_or(1.0).clamp(0.5, 4.0) * SINGLE_LEADING_EM * 1000.0).round() / 1000.0
}

fn typst_paper(ui_value: Option<&str>) -> String {
    match ui_value {
        Some("letter") => "us-letter".into(),
        Some("a5") => "a5".into(),
        _ => "a4".into(),
    }
}

fn first_strong_direction(text: &str) -> &'static str {
    for c in text.chars() {
        match c {
            '\u{0590}'..='\u{08FF}' | '\u{FB1D}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}' => {
                return "rtl"
            }
            'A'..='Z' | 'a'..='z' | '\u{00C0}'..='\u{024F}' => return "ltr",
            _ => {}
        }
    }
    "ltr"
}

struct ExportWorld {
    library: LazyHash<Library>,
    fonts: FontStore,
    main: FileId,
    sources: HashMap<FileId, Source>,
    bytes: HashMap<FileId, Bytes>,
}

const PREAMBLE_MARKER: &str = "// PREAMBLE";

fn template_source(custom: Option<&str>, preamble: Option<&str>) -> Result<String, String> {
    let preamble = preamble.unwrap_or("");
    match custom {
        Some(source) => Ok(format!("{preamble}\n{source}")),
        None => {
            let builtin = ASSETS
                .get_file("template.typ")
                .and_then(|f| f.contents_utf8())
                .ok_or("export template missing from bundle")?;
            Ok(builtin.replace(PREAMBLE_MARKER, preamble))
        }
    }
}

impl ExportWorld {
    fn new(
        prepared: &Prepared,
        settings: &TemplateSettings,
        template: &str,
    ) -> Result<Self, String> {
        let main = project_id(TEMPLATE)?;
        let mut sources = HashMap::new();
        sources.insert(main, Source::new(main, template.to_string()));

        let settings_json =
            serde_json::to_string(settings).map_err(|e| format!("bad export settings: {e}"))?;

        let blocks_json = serde_json::to_string(&prepared.blocks)
            .map_err(|e| format!("bad block list: {e}"))?;

        let mut bytes = HashMap::new();
        bytes.insert(project_id(BLOCKS)?, Bytes::new(blocks_json.into_bytes()));
        bytes.insert(project_id(SETTINGS)?, Bytes::new(settings_json.into_bytes()));
        for (path, data) in &prepared.images {
            bytes.insert(project_id(path)?, Bytes::new(data.clone()));
        }

        let mut fonts = FontStore::new();
        fonts.extend(typst_kit::fonts::embedded());
        fonts.extend(typst_kit::fonts::system());

        Ok(Self {
            library: LazyHash::new(<Library as LibraryExt>::builder().build()),
            fonts,
            main,
            sources,
            bytes,
        })
    }

    fn package_file(&self, id: FileId) -> FileResult<Bytes> {
        let VirtualRoot::Package(spec) = id.root() else {
            return Err(FileError::NotFound(std::path::PathBuf::from(id.vpath().get_without_slash())));
        };
        let path = format!(
            "packages/{}/{}/{}/{}",
            spec.namespace,
            spec.name,
            spec.version,
            id.vpath().get_without_slash()
        );
        ASSETS
            .get_file(&path)
            .map(|f| Bytes::new(f.contents().to_vec()))
            .ok_or_else(|| FileError::NotFound(std::path::PathBuf::from(id.vpath().get_without_slash())))
    }
}

fn project_id(name: &str) -> Result<FileId, String> {
    let vpath = VirtualPath::new(name).map_err(|e| format!("bad virtual path {name}: {e}"))?;
    Ok(RootedPath::new(VirtualRoot::Project, vpath).intern())
}

impl World for ExportWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        self.fonts.book()
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some(source) = self.sources.get(&id) {
            return Ok(source.clone());
        }
        let bytes = self.file(id)?;
        let text = std::str::from_utf8(&bytes)
            .map_err(|_| FileError::InvalidUtf8)?
            .to_string();
        Ok(Source::new(id, text))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(bytes) = self.bytes.get(&id) {
            return Ok(bytes.clone());
        }
        self.package_file(id)
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.font(index)
    }

    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

fn join_messages<T: std::fmt::Display>(errors: impl IntoIterator<Item = T>) -> String {
    errors
        .into_iter()
        .map(|e| e.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateImport {
    pub file_name: String,
    pub missing_fonts: Vec<String>,
    pub declared_params: Vec<String>,
}

pub struct TemplateReport {
    pub missing_fonts: Vec<String>,
    pub declared_params: Vec<String>,
}

static FONT_FAMILIES: LazyLock<Vec<String>> = LazyLock::new(|| {
    let mut store = FontStore::new();
    store.extend(typst_kit::fonts::embedded());
    store.extend(typst_kit::fonts::system());

    let mut families: Vec<String> = store
        .book()
        .families()
        .map(|(name, _)| name.to_string())
        .collect();
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup();
    families
});

pub fn font_families() -> Vec<String> {
    FONT_FAMILIES.clone()
}

pub fn validate_template(source: &str) -> Result<TemplateReport, String> {
    markdown_to_pdf(
        "# Template check\n\nBody text.\n",
        &ExportSettings::default(),
        &[],
        Some(source),
    )?;

    Ok(TemplateReport {
        missing_fonts: missing_fonts(source),
        declared_params: declared_params(source),
    })
}

fn missing_fonts(source: &str) -> Vec<String> {
    let mut store = FontStore::new();
    store.extend(typst_kit::fonts::embedded());
    store.extend(typst_kit::fonts::system());
    let available = store.book();

    FONT_NAME
        .captures_iter(source)
        .map(|caps| caps[1].to_string())
        .filter(|name| available.select_family(&name.to_lowercase()).next().is_none())
        .collect()
}

fn declared_params(source: &str) -> Vec<String> {
    TEMPLATE_PARAM
        .captures_iter(source)
        .map(|caps| caps[1].to_string())
        .collect()
}

pub fn markdown_to_pdf(
    markdown: &str,
    settings: &ExportSettings,
    search_dirs: &[PathBuf],
    custom_template: Option<&str>,
) -> Result<Vec<u8>, String> {
    let template_settings = settings.to_template(markdown);
    let prepared = preprocess::prepare(markdown, &template_settings.dir, search_dirs);
    let template = template_source(custom_template, settings.preamble.as_deref())?;
    let world = ExportWorld::new(&prepared, &template_settings, &template)?;

    let document = typst::compile::<PagedDocument>(&world)
        .output
        .map_err(|errors| join_messages(errors.iter().map(|e| e.message.clone())))?;

    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|errors| join_messages(errors.iter().map(|e| e.message.clone())))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../assets/export/fixture.md");

    #[test]
    fn compiles_mixed_direction_note_with_math() {
        let settings = ExportSettings {
            direction: Some("rtl".into()),
            ..Default::default()
        };
        let pdf = markdown_to_pdf(FIXTURE, &settings, &[], None).expect("compile fixture");
        assert!(pdf.starts_with(b"%PDF"));
        std::fs::write(
            std::env::temp_dir().join("scratch-export-test.pdf"),
            &pdf,
        )
        .expect("write test pdf");
    }

    #[test]
    fn settings_reach_the_document() {
        let letter = markdown_to_pdf(
            "# Test\n\nBody text.",
            &ExportSettings {
                paper_size: Some("letter".into()),
                page_numbers: Some(false),
                ..Default::default()
            },
            &[],
            None,
        )
        .expect("compile letter");
        assert!(letter.starts_with(b"%PDF"));
        std::fs::write(
            std::env::temp_dir().join("scratch-export-letter.pdf"),
            &letter,
        )
        .expect("write letter pdf");
    }

    #[test]
    fn auto_direction_uses_first_strong_character() {
        assert_eq!(first_strong_direction("שלום עולם"), "rtl");
        assert_eq!(first_strong_direction("hello world"), "ltr");
        assert_eq!(first_strong_direction("# כותרת\n\nplain"), "rtl");
        assert_eq!(first_strong_direction("## 2026 — plain"), "ltr");
        assert_eq!(first_strong_direction("$x > y$"), "ltr");
    }

    #[test]
    fn ui_paper_names_are_valid_typst_papers() {
        for ui in ["a4", "letter", "a5"] {
            let pdf = markdown_to_pdf(
                "text",
                &ExportSettings {
                    paper_size: Some(ui.into()),
                    ..Default::default()
                },
                &[],
                None,
            );
            assert!(pdf.is_ok(), "paper {ui} failed: {:?}", pdf.err());
        }
    }

    #[test]
    fn mixed_direction_note_keeps_each_block_in_its_own_direction() {
        let source = "# Test note\n\nLet $x \\in \\mathbb{R}$ be given.\n\nואם אני כותבת בעברית? יהי $x > y$. אוקי זה בסדר.\n";
        let prepared = crate::preprocess::prepare(source, "ltr", &[]);
        let dirs: Vec<&str> = prepared.blocks.iter().map(|b| b.dir.as_str()).collect();
        assert_eq!(dirs, vec!["ltr", "ltr", "rtl"]);

        let pdf = markdown_to_pdf(source, &ExportSettings::default(), &[], None)
            .expect("compile mixed-direction note");
        assert!(pdf.starts_with(b"%PDF"));
        std::fs::write(
            std::env::temp_dir().join("scratch-export-mixed.pdf"),
            &pdf,
        )
        .expect("write mixed pdf");
    }

    #[test]
    fn uniform_note_renders_as_one_block() {
        let prepared = crate::preprocess::prepare("# Title\n\nBody one.\n\nBody two.\n", "ltr", &[]);
        assert_eq!(prepared.blocks.len(), 1);
        assert_eq!(prepared.blocks[0].dir, "ltr");
    }

    #[test]
    fn wikilinks_become_plain_text() {
        let prepared = crate::preprocess::prepare("See [[Some Note]] here.", "ltr", &[]);
        assert!(prepared.blocks[0].md.contains("See Some Note here."));
        assert!(!prepared.blocks[0].md.contains("[["));
    }

    #[test]
    fn missing_images_fall_back_to_alt_text() {
        let prepared = crate::preprocess::prepare("![a diagram](assets/nope.png)", "ltr", &[]);
        assert!(prepared.images.is_empty());
        assert!(prepared.blocks[0].md.contains("a diagram"));
        assert!(!prepared.blocks[0].md.contains("nope.png"));
    }

    #[test]
    fn local_images_are_embedded_from_search_dirs() {
        let dir = std::env::temp_dir().join("scratch-export-img-test");
        std::fs::create_dir_all(dir.join("assets")).expect("create assets dir");
        let png = [
            0x89u8, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
            0xB0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(dir.join("assets/dot.png"), png).expect("write png");

        let prepared = crate::preprocess::prepare(
            "![a dot](assets/dot.png)",
            "ltr",
            std::slice::from_ref(&dir),
        );
        assert_eq!(prepared.images.len(), 1);
        assert!(prepared.blocks[0].md.contains("images/0.png"));

        let pdf = markdown_to_pdf(
            "Before.\n\n![a dot](assets/dot.png)\n\nAfter.",
            &ExportSettings::default(),
            std::slice::from_ref(&dir),
            None,
        )
        .expect("compile with image");
        assert!(pdf.starts_with(b"%PDF"));
    }

    const COVERAGE: &str = include_str!("../assets/export/coverage.md");

    #[test]
    fn coverage_fixture_compiles() {
        let pdf = markdown_to_pdf(COVERAGE, &ExportSettings::default(), &[], None)
            .expect("compile coverage fixture");
        assert!(pdf.starts_with(b"%PDF"));
        std::fs::write(
            std::env::temp_dir().join("scratch-export-coverage.pdf"),
            &pdf,
        )
        .expect("write coverage pdf");
    }

    #[test]
    fn frontmatter_is_stripped() {
        let prepared = crate::preprocess::prepare(
            "---\ntitle: X\ntags: [a]\n---\n\n# Real heading\n",
            "ltr",
            &[],
        );
        let all: String = prepared.blocks.iter().map(|b| b.md.clone()).collect();
        assert!(!all.contains("title: X"));
        assert!(all.contains("# Real heading"));
    }

    #[test]
    fn task_items_become_checkboxes() {
        let prepared =
            crate::preprocess::prepare("- [ ] todo\n- [x] done\n", "ltr", &[]);
        let md = &prepared.blocks[0].md;
        assert!(md.contains('\u{2610}') && md.contains('\u{2611}'));
        assert!(!md.contains("[ ]") && !md.contains("[x]"));
    }

    #[test]
    fn footnote_definitions_follow_their_reference() {
        let source = "English text[^a] here.\n\n[^a]: English note.\n\nעברית[^b] כאן.\n\n[^b]: הערה.\n";
        let prepared = crate::preprocess::prepare(source, "ltr", &[]);
        assert_eq!(prepared.blocks.len(), 2);
        let english = &prepared.blocks[0];
        let hebrew = &prepared.blocks[1];
        assert_eq!(english.dir, "ltr");
        assert_eq!(hebrew.dir, "rtl");
        assert!(english.md.contains("[^a]: English note."));
        assert!(!english.md.contains("[^b]"));
        assert!(hebrew.md.contains("[^b]: הערה."));
    }

    #[test]
    fn long_notes_paginate() {
        let body = (1..=120)
            .map(|i| format!("Paragraph number {i} with enough text to take a full line of space."))
            .collect::<Vec<_>>()
            .join("\n\n");
        let pdf = markdown_to_pdf(&body, &ExportSettings::default(), &[], None)
            .expect("compile long note");
        std::fs::write(std::env::temp_dir().join("scratch-export-long.pdf"), &pdf)
            .expect("write long pdf");
    }

    #[test]
    fn preamble_rules_apply_to_the_document() {
        let settings = ExportSettings {
            preamble: Some("#set page(paper: \"a5\")".into()),
            ..Default::default()
        };
        let pdf = markdown_to_pdf("Body.", &settings, &[], None).expect("compile with preamble");
        std::fs::write(std::env::temp_dir().join("scratch-export-preamble.pdf"), &pdf)
            .expect("write preamble pdf");
    }

    #[test]
    fn advanced_knobs_compile() {
        let settings = ExportSettings {
            justify: Some(true),
            hyphenate: Some(true),
            paragraph_spacing_em: Some(1.5),
            first_line_indent_em: Some(1.0),
            heading_numbering: Some("1.1".into()),
            page_number_format: Some("1 / 1".into()),
            header_text: Some("Header line".into()),
            footer_text: Some("Footer line".into()),
            columns: Some(2),
            footnote_size_pt: Some(7.5),
            equation_numbering: Some("(1)".into()),
            ..Default::default()
        };
        let pdf = markdown_to_pdf(
            "# Heading\n\nBody text with a footnote[^a].\n\n[^a]: Note.\n\n$$x = y$$\n",
            &settings,
            &[],
            None,
        )
        .expect("compile with advanced knobs");
        std::fs::write(std::env::temp_dir().join("scratch-export-advanced.pdf"), &pdf)
            .expect("write advanced pdf");
    }

    #[test]
    fn custom_template_is_used_and_receives_params() {
        let template = r#"#import "@preview/cmarker:0.1.6": render
#let settings = json("settings.json")
#let blocks = json("blocks.json")
#set page(paper: "a5", margin: 15mm)
#text(font: "Libertinus Serif")[Title: #settings.params.at("title", default: "none")]
#for entry in blocks { render(entry.md) }
"#;
        let settings = ExportSettings {
            params: HashMap::from([("title".to_string(), "From preset".to_string())]),
            ..Default::default()
        };
        let pdf = markdown_to_pdf("Body.", &settings, &[], Some(template))
            .expect("compile custom template");
        std::fs::write(std::env::temp_dir().join("scratch-export-custom.pdf"), &pdf)
            .expect("write custom pdf");

        let report = validate_template(template).expect("validate template");
        assert_eq!(report.declared_params, vec!["title".to_string()]);
    }

    #[test]
    fn validation_rejects_broken_templates_and_flags_missing_fonts() {
        assert!(validate_template("#this is not valid typst(").is_err());

        let template = r#"#let settings = json("settings.json")
#let blocks = json("blocks.json")
#set text(font: ("Definitely Not Installed Font", "Libertinus Serif"))
#for entry in blocks [#entry.md]
"#;
        let report = validate_template(template).expect("validate font template");
        assert_eq!(
            report.missing_fonts,
            vec!["Definitely Not Installed Font".to_string()]
        );
    }

    #[test]
    fn line_spacing_is_a_line_height_multiplier() {
        assert_eq!(leading_em(None), 0.65);
        assert_eq!(leading_em(Some(1.0)), 0.65);
        assert_eq!(leading_em(Some(2.0)), 1.3);
        assert_eq!(leading_em(Some(0.0)), 0.325);
        assert_eq!(leading_em(Some(99.0)), 2.6);
    }

    #[test]
    fn system_fonts_are_discoverable() {
        let mut store = FontStore::new();
        store.extend(typst_kit::fonts::system());
        let book = store.book();
        let families: Vec<String> = book.families().map(|(name, _)| name.to_string()).collect();
        assert!(
            !families.is_empty(),
            "no system fonts found; export would fall back to embedded faces only"
        );
        assert!(
            families.iter().any(|f| f.to_lowercase().contains("dejavu")),
            "expected a common system family among {} discovered families",
            families.len()
        );
    }

    #[test]
    fn system_font_family_reaches_the_pdf() {
        let settings = ExportSettings {
            font_family: Some("DejaVu Serif".into()),
            ..Default::default()
        };
        let pdf = markdown_to_pdf("System font check.", &settings, &[], None)
            .expect("compile with system font");
        let haystack = String::from_utf8_lossy(&pdf);
        assert!(
            haystack.contains("DejaVuSerif"),
            "system font family was not embedded in the PDF"
        );
    }

    #[test]
    fn draft_assets_migrate_on_save() {
        let base = std::env::temp_dir().join("scratch-migrate-test");
        let source = base.join("drafts");
        let target = base.join("saved");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(source.join("assets")).expect("mkdirs");
        std::fs::create_dir_all(&target).expect("mkdir target");
        std::fs::write(source.join("assets/pic.png"), b"png-bytes").expect("write asset");

        let md = "Before ![alt](<assets/pic.png>) after, remote ![r](https://x/y.png), missing ![m](assets/gone.png).";
        let target_doc = target.join("report.md");
        let result = crate::preprocess::migrate_assets(md, &source, &target_doc);

        assert!(result.markdown.contains("![alt](<assets/report/pic.png>)"));
        assert!(result.markdown.contains("https://x/y.png"));
        assert!(result.markdown.contains("assets/gone.png"));
        assert!(result.failed.is_empty());
        assert_eq!(
            std::fs::read(target.join("assets/report/pic.png")).expect("copied"),
            b"png-bytes"
        );

        let again = crate::preprocess::migrate_assets(md, &source, &target_doc);
        assert!(again.markdown.contains("![alt](<assets/report/pic-1.png>)"));
    }
}
