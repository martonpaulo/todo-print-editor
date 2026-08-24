import type { SVGProps } from 'react'

type IconName =
  | 'arrow-down'
  | 'arrow-up'
  | 'calendar'
  | 'check'
  | 'code'
  | 'list'
  | 'panel'
  | 'plus'
  | 'printer'
  | 'trash'
  | 'warning'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export const Icon = ({ name, size = 18, ...props }: IconProps) => {
  const paths: Record<IconName, React.ReactNode> = {
    'arrow-down': <path d="m6 9 6 6 6-6" />,
    'arrow-up': <path d="m6 15 6-6 6 6" />,
    calendar: (
      <>
        <path d="M7 3v3M17 3v3M4 9h16" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />,
    list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M15 4v16" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    printer: (
      <>
        <path d="M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7z" />
      </>
    ),
    trash: <path d="M4 7h16M9 11v6M15 11v6M6 7l1 14h10l1-14M9 7V4h6v3" />,
    warning: (
      <>
        <path d="M12 4 3 20h18L12 4Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
