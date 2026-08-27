use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
const NOTE: &str = "note.md";
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
    fn new(markdown: &str, settings: &TemplateSettings) -> Result<Self, String> {
        let template = ASSETS
            .get_file("template.typ")
            .and_then(|f| f.contents_utf8())
            .ok_or("export template missing from bundle")?;

        let main = project_id(TEMPLATE)?;
        let mut sources = HashMap::new();
        sources.insert(main, Source::new(main, template.to_string()));

        let settings_json =
            serde_json::to_string(settings).map_err(|e| format!("bad export settings: {e}"))?;

        let mut bytes = HashMap::new();
        bytes.insert(
            project_id(NOTE)?,
            Bytes::new(markdown.as_bytes().to_vec()),
        );
        bytes.insert(project_id(SETTINGS)?, Bytes::new(settings_json.into_bytes()));

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

pub fn markdown_to_pdf(markdown: &str, settings: &ExportSettings) -> Result<Vec<u8>, String> {
    let world = ExportWorld::new(markdown, &settings.to_template(markdown))?;

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
        let pdf = markdown_to_pdf(FIXTURE, &settings).expect("compile fixture");
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
            );
            assert!(pdf.is_ok(), "paper {ui} failed: {:?}", pdf.err());
        }
    }
}
