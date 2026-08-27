use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use crate::preprocess::{self, Prepared};
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
    page_numbers: bool,
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
            leading: format!("{}em", self.line_spacing.unwrap_or(0.75)),
            fonts,
            lang: if dir == "rtl" { "he".into() } else { "en".into() },
            dir: dir.into(),
            page_numbers: self.page_numbers.unwrap_or(true),
        }
    }
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

impl ExportWorld {
    fn new(prepared: &Prepared, settings: &TemplateSettings) -> Result<Self, String> {
        let template = ASSETS
            .get_file("template.typ")
            .and_then(|f| f.contents_utf8())
            .ok_or("export template missing from bundle")?;

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

pub fn markdown_to_pdf(
    markdown: &str,
    settings: &ExportSettings,
    search_dirs: &[PathBuf],
) -> Result<Vec<u8>, String> {
    let template_settings = settings.to_template(markdown);
    let prepared = preprocess::prepare(markdown, &template_settings.dir, search_dirs);
    let world = ExportWorld::new(&prepared, &template_settings)?;

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
        let pdf = markdown_to_pdf(FIXTURE, &settings, &[]).expect("compile fixture");
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

        let pdf = markdown_to_pdf(source, &ExportSettings::default(), &[])
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
        )
        .expect("compile with image");
        assert!(pdf.starts_with(b"%PDF"));
    }
}
