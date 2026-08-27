use pulldown_cmark::{Event, Options, Parser};
use regex::Regex;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static WIKILINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[\[([^\]]+?)\]\]").unwrap());
static IMAGE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"!\[([^\]]*)\]\(<?([^)>\s]+)>?(\s+"[^"]*")?\)"#).unwrap());
static LINK_DEFINITION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\s*\[[^\^\]]+\]:\s*\S+").unwrap());
static FRONTMATTER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)\A\x{feff}?---[ \t]*\r?\n.*?\r?\n---[ \t]*(\r?\n|\z)").unwrap()
});
static TASK_ITEM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+").unwrap()
});
static FOOTNOTE_DEFINITION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?m)^\s*\[\^([^\]]+)\]:.*$").unwrap());

#[derive(Debug, Clone, Serialize)]
pub struct Block {
    pub dir: String,
    pub md: String,
}

#[derive(Debug, Clone)]
pub struct Prepared {
    pub blocks: Vec<Block>,
    pub images: Vec<(String, Vec<u8>)>,
}

pub fn prepare(markdown: &str, default_dir: &str, search_dirs: &[PathBuf]) -> Prepared {
    let body = FRONTMATTER.replace(markdown, "");
    let without_wikilinks = WIKILINK.replace_all(&body, "$1");
    let with_checkboxes = TASK_ITEM.replace_all(&without_wikilinks, |caps: &regex::Captures| {
        let checked = caps[2].to_ascii_lowercase() == "x";
        format!("{}{} ", &caps[1], if checked { "\u{2611}" } else { "\u{2610}" })
    });
    let (rewritten, images) = embed_images(&with_checkboxes, search_dirs);
    let blocks = split_blocks(&rewritten, default_dir);
    Prepared { blocks, images }
}

fn embed_images(markdown: &str, search_dirs: &[PathBuf]) -> (String, Vec<(String, Vec<u8>)>) {
    let mut images: Vec<(String, Vec<u8>)> = Vec::new();

    let rewritten = IMAGE
        .replace_all(markdown, |caps: &regex::Captures| {
            let alt = caps.get(1).map_or("", |m| m.as_str());
            let url = caps.get(2).map_or("", |m| m.as_str());

            match resolve_image(url, search_dirs) {
                Some(bytes) => {
                    let extension = Path::new(url)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("png");
                    let virtual_path = format!("images/{}.{}", images.len(), extension);
                    images.push((virtual_path.clone(), bytes));
                    format!("![{alt}](<{virtual_path}>)")
                }
                None => alt.to_string(),
            }
        })
        .into_owned();

    (rewritten, images)
}

fn resolve_image(url: &str, search_dirs: &[PathBuf]) -> Option<Vec<u8>> {
    if url.starts_with("http://") || url.starts_with("https://") || url.starts_with("data:") {
        return None;
    }

    let decoded = urlencoding::decode(url).map(|s| s.into_owned()).ok()?;
    let candidate = Path::new(&decoded);

    if candidate.is_absolute() {
        return std::fs::read(candidate).ok();
    }

    search_dirs
        .iter()
        .map(|dir| dir.join(candidate))
        .find_map(|path| std::fs::read(path).ok())
}

fn split_blocks(markdown: &str, default_dir: &str) -> Vec<Block> {
    let ranges = top_level_ranges(markdown);

    let mut definitions: Vec<&str> = Vec::new();
    let mut footnotes: Vec<(String, &str)> = Vec::new();
    let mut candidates: Vec<&str> = ranges
        .iter()
        .filter_map(|range| markdown.get(range.clone()))
        .collect();
    candidates.extend(gaps(markdown, &ranges));

    for line in candidates.iter().flat_map(|text| text.lines()) {
        if LINK_DEFINITION.is_match(line) {
            definitions.push(line);
        } else if let Some(caps) = FOOTNOTE_DEFINITION.captures(line) {
            footnotes.push((caps[1].to_string(), line));
        }
    }

    let mut blocks: Vec<Block> = ranges
        .iter()
        .filter_map(|range| markdown.get(range.clone()))
        .map(str::trim_end)
        .filter(|source| !source.trim().is_empty())
        .filter(|source| !is_definition_only(source))
        .map(|source| Block {
            dir: block_direction(source, default_dir).to_string(),
            md: source.to_string(),
        })
        .collect();

    if blocks.is_empty() {
        return vec![Block {
            dir: default_dir.to_string(),
            md: markdown.to_string(),
        }];
    }

    if blocks.iter().all(|b| b.dir == blocks[0].dir) {
        return vec![Block {
            dir: blocks[0].dir.clone(),
            md: markdown.to_string(),
        }];
    }

    for block in &mut blocks {
        let mut appended: Vec<&str> = definitions.clone();
        appended.extend(
            footnotes
                .iter()
                .filter(|(label, _)| block.md.contains(&format!("[^{label}]")))
                .map(|(_, line)| *line),
        );
        if !appended.is_empty() {
            block.md.push_str(&format!("\n\n{}\n", appended.join("\n")));
        }
    }

    blocks
}

fn gaps<'a>(markdown: &'a str, ranges: &[std::ops::Range<usize>]) -> Vec<&'a str> {
    let mut gaps = Vec::new();
    let mut cursor = 0usize;
    for range in ranges {
        if range.start > cursor {
            if let Some(text) = markdown.get(cursor..range.start) {
                gaps.push(text);
            }
        }
        cursor = cursor.max(range.end);
    }
    if let Some(text) = markdown.get(cursor..) {
        gaps.push(text);
    }
    gaps
}

fn is_definition_only(source: &str) -> bool {
    source
        .lines()
        .filter(|line| !line.trim().is_empty())
        .all(|line| LINK_DEFINITION.is_match(line) || FOOTNOTE_DEFINITION.is_match(line))
}

fn top_level_ranges(markdown: &str) -> Vec<std::ops::Range<usize>> {
    let mut ranges = Vec::new();
    let mut depth = 0usize;

    for (event, range) in Parser::new_ext(markdown, Options::ENABLE_TABLES).into_offset_iter() {
        match event {
            Event::Start(_) => {
                if depth == 0 {
                    ranges.push(range);
                }
                depth += 1;
            }
            Event::End(_) => depth = depth.saturating_sub(1),
            _ if depth == 0 => ranges.push(range),
            _ => {}
        }
    }

    ranges
}

fn block_direction(source: &str, default_dir: &str) -> &'static str {
    let text: String = Parser::new(source)
        .filter_map(|event| match event {
            Event::Text(t) | Event::Code(t) => Some(t.into_string()),
            _ => None,
        })
        .collect();

    match first_strong(&text) {
        Some(dir) => dir,
        None if default_dir == "rtl" => "rtl",
        None => "ltr",
    }
}

fn first_strong(text: &str) -> Option<&'static str> {
    text.chars().find_map(|c| match c {
        '\u{0590}'..='\u{08FF}' | '\u{FB1D}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}' => Some("rtl"),
        'A'..='Z' | 'a'..='z' | '\u{00C0}'..='\u{024F}' => Some("ltr"),
        _ => None,
    })
}
