import * as React from "react"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  count?: number
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', count, children, ...props }, ref) => {
    const variantStyles = {
      default: "bg-primary text-white",
      secondary: "bg-secondary text-secondary-foreground",
      destructive: "bg-destructive text-destructive-foreground",
      outline: "border border-input bg-background"
    }

    return (
      <div
        ref={ref}
        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantStyles[variant]} ${className || ''}`}
        {...props}
      >
        {count !== undefined ? count : children}
      </div>
    )
  }
)
Badge.displayName = "Badge"

export { Badge }
