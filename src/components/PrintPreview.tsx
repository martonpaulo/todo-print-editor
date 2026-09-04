import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COPY } from '../copy'
import { groupPanelsIntoPages, PANELS_PER_PAGE, paginateBlocks } from '../domain/pagination'
import { recordProfileSample } from '../profiling'
import { Icon } from './Icon'
import { MoonText } from './MoonText'
import type { ListBlock, TodoDocument, Typography } from '../domain/types'

export interface LayoutStatus {
  ready: boolean
  overflowListIds: string[]
  panelCount: number
  pageCount: number
}

interface PrintPreviewProps {
  document: TodoDocument
  onLayoutStatusChange: (status: LayoutStatus) => void
}

interface MeasurementState {
  listHeights: Record<string, number>
  firstPanelCapacity: number
  panelCapacity: number
  listGap: number
  ready: boolean
}

/**
 * Pixels held back from every measured panel capacity. Browser layout rounds a panel's content box
 * and the paginated lists inside it independently, so a list measured at exactly the panel height
 * can still spill by a fraction once it is laid out in place. Subtracted here, at the measurement
 * boundary, so `paginateBlocks` receives final effective numbers and applies no allowance of its
 * own — the same panel then has the same capacity however it was created.
 */
const MEASUREMENT_SAFETY_PX = 15

const EMPTY_MEASUREMENTS: MeasurementState = {
  listHeights: {},
  firstPanelCapacity: 0,
  panelCapacity: 0,
  listGap: 0,
  ready: false,
}

const formatDate = (isoDate: string): string => {
  const date = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

interface PrintListProps {
  list: ListBlock
  typography: Typography
  overflowing?: boolean
}

/**
 * Document content honors the document's typography; the checkbox, the panel number and the date
 * stay Latin, because they are layout furniture rather than the text the user wrote.
 */
const DocumentText = ({ text, typography }: { text: string; typography: Typography }) =>
  typography === 'moon' ? <MoonText text={text} /> : <>{text}</>

/**
 * Memoized because every list is rendered twice — once in the hidden
 * measurement layer and once in its panel — and an edit changes exactly one
 * list object. Without the bail-out React rewrites the whole print DOM on each
 * keystroke, which invalidates layout for every list and dominates the measured
 * editing cost (see docs/performance.md).
 */
const PrintList = memo(({ list, typography, overflowing = false }: PrintListProps) => (
  <section className={`print-list${overflowing ? ' print-list--overflow' : ''}`}>
    {list.title.trim() !== '' && (
      <>
        <h2 className="print-list__title">
          <DocumentText text={list.title} typography={typography} />
        </h2>
        <div className="print-list__rule" />
      </>
    )}
    <div className="print-task-grid">
      {list.items.map((item) => (
        <div className="print-task" key={item.id}>
          <span
            className={`print-checkbox${item.checked ? ' print-checkbox--checked' : ''}`}
            aria-label={item.checked ? COPY.checkedTask : COPY.uncheckedTask}
          >
            {item.checked ? '✓' : ''}
          </span>
          <span
            className={[
              'print-task__text',
              item.checked ? 'print-task__text--checked' : '',
              // The strike over a completed task cannot be a text decoration in Moon mode, so the
              // stylesheet has to know which of the two ways to draw it applies here.
              typography === 'moon' ? 'print-task__text--moon' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.text ? (
              <DocumentText text={item.text} typography={typography} />
            ) : (
              '\u00a0'
            )}
          </span>
        </div>
      ))}
    </div>
  </section>
))
PrintList.displayName = 'PrintList'

interface PanelHeaderProps {
  document: TodoDocument
  panelIndex: number
  panelCount: number
}

const PanelHeader = ({ document, panelIndex, panelCount }: PanelHeaderProps) => (
  <header className="print-panel__header">
    {panelIndex === 0 && document.showDate && (
      <h1 className="print-date">{formatDate(document.date)}</h1>
    )}
    {document.showPanelNumbers && (
      <p className="print-panel-number">{COPY.panelNumber(panelIndex + 1, panelCount)}</p>
    )}
  </header>
)

interface PrintPanelProps {
  document: TodoDocument
  lists: ListBlock[]
  panelIndex: number
  panelCount: number
  overflowListIds: string[]
  capacityAttribute?: 'first' | 'regular'
}

/**
 * A slot the document does not reach. It occupies its share of the sheet so the paper keeps its
 * three panel slots, and carries nothing: no date, no numbering, no lists, and no element an
 * assistive technology would announce.
 */
const FillerPanel = () => <div className="print-panel print-panel--filler" aria-hidden="true" />

const PrintPanel = ({
  document,
  lists,
  panelIndex,
  panelCount,
  overflowListIds,
  capacityAttribute,
}: PrintPanelProps) => (
  <article className="print-panel">
    <PanelHeader document={document} panelIndex={panelIndex} panelCount={panelCount} />
    <div
      className="print-panel__lists"
      data-capacity-first={capacityAttribute === 'first' ? '' : undefined}
      data-capacity-regular={capacityAttribute === 'regular' ? '' : undefined}
    >
      {lists.map((list) => (
        <PrintList
          key={list.id}
          list={list}
          typography={document.typography}
          overflowing={overflowListIds.includes(list.id)}
        />
      ))}
    </div>
  </article>
)

const MeasurementLayer = ({
  document,
  rootRef,
}: {
  document: TodoDocument
  rootRef: React.RefObject<HTMLDivElement | null>
}) => {
  const lists = document.blocks.filter((block): block is ListBlock => block.kind === 'list')

  return (
    <div className="measurement-layer" ref={rootRef} aria-hidden="true">
      <PrintPanel
        document={document}
        lists={[]}
        panelIndex={0}
        panelCount={99}
        overflowListIds={[]}
        capacityAttribute="first"
      />
      <PrintPanel
        document={document}
        lists={[]}
        panelIndex={1}
        panelCount={99}
        overflowListIds={[]}
        capacityAttribute="regular"
      />
      <span className="measurement-gap" data-measure-gap />
      <div className="measurement-lists">
        {lists.map((list) => (
          <div data-measure-list={list.id} key={list.id}>
            <PrintList list={list} typography={document.typography} />
          </div>
        ))}
      </div>
    </div>
  )
}

const measurementsMatch = (left: MeasurementState, right: MeasurementState): boolean => {
  if (
    left.firstPanelCapacity !== right.firstPanelCapacity ||
    left.panelCapacity !== right.panelCapacity ||
    left.listGap !== right.listGap ||
    left.ready !== right.ready
  ) {
    return false
  }

  const leftEntries = Object.entries(left.listHeights)
  const rightEntries = Object.entries(right.listHeights)
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([id, height]) => right.listHeights[id] === height)
  )
}

const usePrintMeasurements = (document: TodoDocument) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const [measurements, setMeasurements] = useState(EMPTY_MEASUREMENTS)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    let active = true

    const measure = () => {
      if (!active) return
      if (typeof window !== 'undefined' && window.matchMedia('print').matches) return

      const measurementStart = performance.now()
      const listHeights: Record<string, number> = {}
      root.querySelectorAll<HTMLElement>('[data-measure-list]').forEach((element) => {
        const id = element.dataset.measureList
        if (id) listHeights[id] = element.getBoundingClientRect().height
      })

      const measuredFirstPanel =
        root.querySelector<HTMLElement>('[data-capacity-first]')?.getBoundingClientRect().height ?? 0
      const measuredPanel =
        root.querySelector<HTMLElement>('[data-capacity-regular]')?.getBoundingClientRect().height ?? 0
      const listGap =
        root.querySelector<HTMLElement>('[data-measure-gap]')?.getBoundingClientRect().width ?? 0
      const listCount = document.blocks.filter((block) => block.kind === 'list').length
      const next = {
        listHeights,
        // The allowance is applied once, here, to both capacities alike; pagination consumes the
        // result as final.
        firstPanelCapacity: Math.max(0, measuredFirstPanel - MEASUREMENT_SAFETY_PX),
        panelCapacity: Math.max(0, measuredPanel - MEASUREMENT_SAFETY_PX),
        listGap,
        ready:
          measuredFirstPanel > 0 &&
          measuredPanel > 0 &&
          Object.keys(listHeights).length === listCount,
      }

      recordProfileSample('print-measurement', performance.now() - measurementStart)
      setMeasurements((current) => (measurementsMatch(current, next) ? current : next))
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(root)
    root.querySelectorAll<HTMLElement>('[data-measure-list]').forEach((element) => {
      observer?.observe(element)
    })
    void globalThis.document.fonts?.ready.then(measure)

    return () => {
      active = false
      observer?.disconnect()
    }
  }, [document])

  return { rootRef, measurements }
}

/**
 * The stage's own rendered content box. `.preview-stage` is padded from a spacing token that a
 * responsive breakpoint changes, so the stylesheet is the single owner of that gutter and the scale
 * below reads the result instead of restating the number.
 */
const contentBoxWidth = (element: HTMLElement): number => {
  const style = window.getComputedStyle(element)
  const parsePx = (value: string): number => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  // `clientWidth` is the padding box, and excludes any scrollbar the stage happens to show.
  return element.clientWidth - parsePx(style.paddingLeft) - parsePx(style.paddingRight)
}

interface PreviewMetrics {
  width: number
  height: number
  scale: number
}

const usePreviewMetrics = () => {
  const stageRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<PreviewMetrics | null>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    const page = pageRef.current
    if (!stage || !page) return

    const measure = () => {
      if (typeof window !== 'undefined' && window.matchMedia('print').matches) return
      const width = page.offsetWidth
      const height = page.offsetHeight
      const availableWidth = Math.max(contentBoxWidth(stage), 1)
      const scale = Math.min(1, availableWidth / width)
      const next = { width, height, scale }
      setMetrics((current) =>
        current &&
        current.width === next.width &&
        current.height === next.height &&
        current.scale === next.scale
          ? current
          : next,
      )
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(stage)
    observer?.observe(page)
    return () => observer?.disconnect()
  }, [])

  return { stageRef, pageRef, metrics }
}

/**
 * Zoom multiplies the fit-to-width scale rather than replacing it, so `1` is always the sheet the
 * preview opens on whatever the stage is wide, and the bounds read as halving and doubling that
 * view. The ladder is additive so every reachable step is a whole quarter — 50%, 75%, … 200% — which
 * a repeated multiplication would not give.
 */
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.25
const ZOOM_FIT = 1

const clampZoom = (zoom: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom / ZOOM_STEP) * ZOOM_STEP))

interface PreviewZoomControlsProps {
  zoom: number
  /** Clamps to the ladder, so a control passes the step it wants and never a bounded value. */
  onZoomChange: (zoom: number) => void
}

/**
 * Screen-only: zoom is a property of looking at the preview, and the printed sheet carries no
 * control. It changes nothing the pagination measures, so it lives here beside the stage rather
 * than in the document settings the paper does follow.
 */
const PreviewZoomControls = ({ zoom, onZoomChange }: PreviewZoomControlsProps) => {
  const percent = Math.round(zoom * 100)

  return (
    <div className="preview-zoom screen-only" role="group" aria-label={COPY.previewZoom}>
      <button
        className="icon-button"
        type="button"
        onClick={() => onZoomChange(zoom - ZOOM_STEP)}
        disabled={zoom <= ZOOM_MIN}
        aria-label={COPY.zoomOut}
        title={COPY.zoomOut}
      >
        <Icon name="zoom-out" size={16} />
      </button>
      {/* Static text, not a live region: the group already names what the number measures, and a
          zoom step is a change the user just made rather than an event to announce over their
          work. */}
      <span className="preview-zoom__level">{COPY.zoomLevel(percent)}</span>
      <button
        className="icon-button"
        type="button"
        onClick={() => onZoomChange(zoom + ZOOM_STEP)}
        disabled={zoom >= ZOOM_MAX}
        aria-label={COPY.zoomIn}
        title={COPY.zoomIn}
      >
        <Icon name="zoom-in" size={16} />
      </button>
      <button
        className="preview-zoom__reset"
        type="button"
        onClick={() => onZoomChange(ZOOM_FIT)}
        disabled={zoom === ZOOM_FIT}
      >
        {COPY.resetZoom}
      </button>
    </div>
  )
}

export const PrintPreview = ({ document, onLayoutStatusChange }: PrintPreviewProps) => {
  const { rootRef, measurements } = usePrintMeasurements(document)
  const { stageRef, pageRef, metrics } = usePreviewMetrics()
  const [zoom, setZoom] = useState(ZOOM_FIT)
  const changeZoom = useCallback((next: number) => setZoom(clampZoom(next)), [])

  const layout = useMemo(
    () =>
      paginateBlocks(document.blocks, measurements.listHeights, {
        firstPanelCapacity: measurements.firstPanelCapacity,
        panelCapacity: measurements.panelCapacity,
        listGap: measurements.listGap,
      }),
    [document.blocks, measurements],
  )

  const panelCount = layout.panels.length
  const pages = useMemo(() => groupPanelsIntoPages(layout.panels), [layout.panels])
  const pageCount = pages.length

  useEffect(() => {
    onLayoutStatusChange({
      ready: measurements.ready,
      overflowListIds: layout.overflowListIds,
      panelCount,
      pageCount,
    })
  }, [layout.overflowListIds, measurements.ready, onLayoutStatusChange, pageCount, panelCount])

  // Every sheet is the same paper, so the shell only mirrors the one measured page box; its size
  // and its three columns come from the print tokens in the stylesheet, never from arithmetic here.
  // The fit scale and the user's zoom compose into the one number both the shell and the sheet use,
  // which keeps the reserved space and the drawn sheet the same size at every zoom level.
  const viewScale = metrics ? metrics.scale * zoom : null
  const shellStyle =
    metrics && viewScale !== null
      ? { width: `${metrics.width * viewScale}px`, height: `${metrics.height * viewScale}px` }
      : undefined
  const pageStyle = viewScale !== null ? { transform: `scale(${viewScale})` } : undefined

  return (
    <>
      <MeasurementLayer document={document} rootRef={rootRef} />
      <PreviewZoomControls zoom={zoom} onZoomChange={changeZoom} />
      <div className="preview-stage" ref={stageRef}>
        <div className="print-pages" aria-label={COPY.previewTitle}>
          {pages.map((slots, pageIndex) => (
            <div className="preview-page-shell" style={shellStyle} key={`page-${pageIndex + 1}`}>
              <div
                className="print-page"
                ref={pageIndex === 0 ? pageRef : undefined}
                style={pageStyle}
              >
                {slots.map((slot, slotIndex) => {
                  const panelIndex = pageIndex * PANELS_PER_PAGE + slotIndex
                  const key = `panel-${panelIndex + 1}`

                  return slot === null ? (
                    <FillerPanel key={key} />
                  ) : (
                    <PrintPanel
                      key={key}
                      document={document}
                      lists={slot}
                      panelIndex={panelIndex}
                      panelCount={panelCount}
                      overflowListIds={layout.overflowListIds}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
