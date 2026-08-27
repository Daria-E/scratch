#import "@preview/cmarker:0.1.6": render
#import "@preview/mitex:0.2.6": mitex

#let settings = json("settings.json")
#let blocks = json("blocks.json")

#set page(
  paper: settings.paper,
  margin: eval(settings.margin),
  numbering: if settings.pageNumbers { "1" } else { none },
)
#set text(
  size: eval(settings.fontSize),
  font: settings.fonts,
  lang: settings.lang,
  dir: if settings.dir == "rtl" { rtl } else { ltr },
)
#set par(leading: eval(settings.leading))

#show raw: set text(dir: ltr, lang: "en")
#show raw.where(block: true): it => align(left, it)

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
