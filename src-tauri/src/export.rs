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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub paper: String,
    pub margin: String,
    pub font_size: String,
    pub leading: String,
    pub fonts: Vec<String>,
    pub lang: String,
    pub dir: String,
    pub page_numbers: bool,
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            paper: "a4".into(),
            margin: "20mm".into(),
            font_size: "11pt".into(),
            leading: "0.75em".into(),
            fonts: vec![
                "Libertinus Serif".into(),
                "New Computer Modern".into(),
                "Noto Serif Hebrew".into(),
                "DejaVu Sans".into(),
            ],
            lang: "en".into(),
            dir: "ltr".into(),
            page_numbers: true,
        }
    }
}

struct ExportWorld {
    library: LazyHash<Library>,
    fonts: FontStore,
    main: FileId,
    sources: HashMap<FileId, Source>,
    bytes: HashMap<FileId, Bytes>,
}

impl ExportWorld {
    fn new(markdown: &str, settings: &ExportSettings) -> Result<Self, String> {
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
    let world = ExportWorld::new(markdown, settings)?;

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
            lang: "he".into(),
            dir: "rtl".into(),
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
}
