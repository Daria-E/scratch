#import "@preview/cmarker:0.1.6": render
#import "@preview/mitex:0.2.6": mitex

#let settings = json("settings.json")
#let blocks = json("blocks.json")

#set page(
  paper: settings.paper,
  margin: eval(settings.margin),
  numbering: settings.pageNumbering,
  header: if settings.header != none { align(center, text(0.9em, settings.header)) },
  footer: if settings.footer != none {
    align(center, text(0.9em, settings.footer))
  } else if settings.pageNumbering != none {
    align(center, text(0.9em, context counter(page).display(settings.pageNumbering)))
  },
  columns: settings.columns,
)
#set text(
  size: eval(settings.fontSize),
  font: settings.fonts,
  lang: settings.lang,
  dir: if settings.dir == "rtl" { rtl } else { ltr },
  hyphenate: settings.hyphenate,
)
#set par(
  leading: eval(settings.leading),
  spacing: eval(settings.parSpacing),
  first-line-indent: eval(settings.firstLineIndent),
  justify: settings.justify,
)
#set heading(numbering: settings.headingNumbering)
#set math.equation(numbering: settings.equationNumbering)
#show footnote.entry: set text(size: eval(settings.footnoteSize))

#show raw: set text(dir: ltr, lang: "en")
#show raw.where(block: true): it => align(left, it)
#show quote.where(block: true): it => block(
  width: 100%,
  fill: luma(245),
  inset: 0.8em,
  radius: 2pt,
  it.body,
)

// PREAMBLE

#let markdown(source) = render(
  source,
  math: mitex,
  scope: (image: (path, alt: none) => image(path, alt: alt)),
)

#for entry in blocks {
  let is_rtl = entry.dir == "rtl"
  block(width: 100%, {
    set text(lang: if is_rtl { "he" } else { "en" }, dir: if is_rtl { rtl } else { ltr })
    set align(if is_rtl { right } else { left })
    markdown(entry.md)
  })
}
