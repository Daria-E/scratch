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
    let without_wikilinks = WIKILINK.replace_all(markdown, "$1").into_owned();
    let (rewritten, images) = embed_images(&without_wikilinks, search_dirs);
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

    let definitions: Vec<&str> = ranges
        .iter()
        .map(|r| r.clone())
        .collect::<Vec<_>>()
        .windows(2)
        .flat_map(|pair| markdown.get(pair[0].end..pair[1].start))
        .chain(ranges.last().and_then(|last| markdown.get(last.end..)))
        .flat_map(|gap| gap.lines())
        .filter(|line| LINK_DEFINITION.is_match(line))
        .collect();

    let mut blocks: Vec<Block> = ranges
        .iter()
        .filter_map(|range| markdown.get(range.clone()))
        .filter(|source| !source.trim().is_empty())
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

    if !definitions.is_empty() {
        let suffix = format!("\n\n{}\n", definitions.join("\n"));
        for block in &mut blocks {
            block.md.push_str(&suffix);
        }
    }

    blocks
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
