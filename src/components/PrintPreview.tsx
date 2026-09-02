import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COPY } from '../copy'
import { groupPanelsIntoPages, PANELS_PER_PAGE, paginateBlocks } from '../domain/pagination'
import { recordProfileSample } from '../profiling'
import type { ListBlock, TodoDocument } from '../domain/types'

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

/**
 * Memoized because every list is rendered twice — once in the hidden
 * measurement layer and once in its panel — and an edit changes exactly one
 * list object. Without the bail-out React rewrites the whole print DOM on each
 * keystroke, which invalidates layout for every list and dominates the measured
 * editing cost (see docs/performance.md).
 */
const PrintList = memo(({ list, overflowing = false }: { list: ListBlock; overflowing?: boolean }) => (
  <section className={`print-list${overflowing ? ' print-list--overflow' : ''}`}>
    <h2 className="print-list__title">{list.title || COPY.untitledList}</h2>
    <div className="print-list__rule" />
    <div className="print-task-grid">
      {list.items.map((item) => (
        <div className="print-task" key={item.id}>
          <span
            className={`print-checkbox${item.checked ? ' print-checkbox--checked' : ''}`}
            aria-label={item.checked ? COPY.checkedTask : COPY.uncheckedTask}
          >
            {item.checked ? '✓' : ''}
          </span>
          <span className={item.checked ? 'print-task__text print-task__text--checked' : 'print-task__text'}>
            {item.text || '\u00a0'}
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
        <PrintList key={list.id} list={list} overflowing={overflowListIds.includes(list.id)} />
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
            <PrintList list={list} />
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
      const availableWidth = Math.max(stage.clientWidth - 48, 1)
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

export const PrintPreview = ({ document, onLayoutStatusChange }: PrintPreviewProps) => {
  const { rootRef, measurements } = usePrintMeasurements(document)
  const { stageRef, pageRef, metrics } = usePreviewMetrics()

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
  const shellStyle = metrics
    ? { width: `${metrics.width * metrics.scale}px`, height: `${metrics.height * metrics.scale}px` }
    : undefined
  const pageStyle = metrics ? { transform: `scale(${metrics.scale})` } : undefined

  return (
    <>
      <MeasurementLayer document={document} rootRef={rootRef} />
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
