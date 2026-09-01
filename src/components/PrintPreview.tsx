import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COPY } from '../copy'
import { paginateBlocks } from '../domain/pagination'
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
  lists: ListBlock[] | null
  panelIndex: number
  panelCount: number
  overflowListIds: string[]
  capacityAttribute?: 'first' | 'regular'
}

const PrintPanel = ({
  document,
  lists,
  panelIndex,
  panelCount,
  overflowListIds,
  capacityAttribute,
}: PrintPanelProps) => (
  <article className={`print-panel${lists === null ? ' print-panel--filler' : ''}`}>
    {lists !== null && (
      <>
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
              overflowing={overflowListIds.includes(list.id)}
            />
          ))}
        </div>
      </>
    )}
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

      const firstPanelCapacity =
        root.querySelector<HTMLElement>('[data-capacity-first]')?.getBoundingClientRect().height ?? 0
      const panelCapacity =
        root.querySelector<HTMLElement>('[data-capacity-regular]')?.getBoundingClientRect().height ?? 0
      const listGap =
        root.querySelector<HTMLElement>('[data-measure-gap]')?.getBoundingClientRect().width ?? 0
      const listCount = document.blocks.filter((block) => block.kind === 'list').length
      const next = {
        listHeights,
        firstPanelCapacity,
        panelCapacity,
        listGap,
        ready:
          firstPanelCapacity > 0 &&
          panelCapacity > 0 &&
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
  const pageCount = Math.max(1, Math.ceil(panelCount / 3))
  const pages = Array.from({ length: pageCount }, (_, pageIndex) =>
    Array.from({ length: 3 }, (_, slotIndex) => layout.panels[pageIndex * 3 + slotIndex] ?? null).filter(p => p !== null),
  )

  useEffect(() => {
    onLayoutStatusChange({
      ready: measurements.ready,
      overflowListIds: layout.overflowListIds,
      panelCount,
      pageCount,
    })
  }, [layout.overflowListIds, measurements.ready, onLayoutStatusChange, pageCount, panelCount])

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          @page page-1 { size: 99mm 210mm; margin: 0; }
          @page page-2 { size: 198mm 210mm; margin: 0; }
          @page page-3 { size: 297mm 210mm; margin: 0; }
          
          .print-page-1, .preview-page-shell-1 { page: page-1; width: 99mm !important; }
          .print-page-2, .preview-page-shell-2 { page: page-2; width: 198mm !important; }
          .print-page-3, .preview-page-shell-3 { page: page-3; width: 297mm !important; }

          html, body, #root, .app-shell, .workspace, .preview-pane, .preview-stage, .print-pages {
            width: 100% !important;
            min-width: 100% !important;
          }
        }
      `}</style>
      <MeasurementLayer document={document} rootRef={rootRef} />
      <div className="preview-stage" ref={stageRef}>
        <div className="print-pages" aria-label={COPY.previewTitle}>
          {pages.map((panels, pageIndex) => {
            const currentPanels = panels.length || 1
            const scale = metrics?.scale || 1
            
            const baseWidth = metrics?.width || 1
            const firstPagePanels = pages[0].length || 1
            const widthPixels = (baseWidth / firstPagePanels) * currentPanels
            
            const shellStyle = metrics ? { 
              width: `${widthPixels * scale}px`, 
              height: `${metrics.height * scale}px` 
            } : undefined
            
            const pageStyle = metrics ? { 
              transform: `scale(${scale})`, 
              gridTemplateColumns: `repeat(${currentPanels}, var(--print-panel-width))`,
              width: `${currentPanels * 99}mm`
            } : { 
              gridTemplateColumns: `repeat(${currentPanels}, var(--print-panel-width))`,
              width: `${currentPanels * 99}mm`
            }

            return (
              <div className={`preview-page-shell preview-page-shell-${currentPanels}`} style={shellStyle} key={`page-${pageIndex + 1}`}>
                <div
                  className={`print-page print-page-${currentPanels}`}
                  ref={pageIndex === 0 ? pageRef : undefined}
                  style={pageStyle}
                >
                  {panels.map((panel, slotIndex) => {
                    const panelIndex = pageIndex * 3 + slotIndex
                    return (
                      <PrintPanel
                        key={`panel-${panelIndex + 1}`}
                        document={document}
                        lists={panel}
                        panelIndex={panelIndex}
                        panelCount={panelCount}
                        overflowListIds={layout.overflowListIds}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
