# Domain Context

## Page

A physical A4 landscape sheet measuring `297mm × 210mm`. A page always has three panel slots, including blank filler slots on its final row.

## Panel

A fixed `99mm × 210mm` printable column. Panels are sequential and three panels make one page. An explicit panel break may create an empty panel. The optional date belongs only to the first panel; optional panel numbering belongs to every non-filler panel.

## List

An atomic titled checklist containing zero or more todo items. A list may move as a whole to the next panel, but it must never be split across panels. A list taller than an empty regular panel is an overflow that blocks printing.

## Panel break

A canonical document block that forces all subsequent content to begin in a new panel. Consecutive panel breaks intentionally create empty panels. In Markdown it is represented by `---`.

## Todo document

The canonical, browser-persisted source of truth: selected date, display options, ordered lists, panel breaks, and todo items. The visual editor and supported Markdown source both edit this document.

## Print layout

A reconstructible projection derived from the todo document and measured list heights. It owns panel assignment and overflow reporting, but it is never persisted as an independent source of truth.
