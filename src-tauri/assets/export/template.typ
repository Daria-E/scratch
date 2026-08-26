#import "@preview/cmarker:0.1.6": render
#import "@preview/mitex:0.2.6": mitex

#let settings = json("settings.json")

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

#render(read("note.md"), math: mitex)
