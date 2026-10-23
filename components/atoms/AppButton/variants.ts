import { cva } from "class-variance-authority";

export const appButtonVariants = cva("font-heading font-bold [font-stretch:100%] active:scale-[.98]", {
  variants: {
    tone: {
      primary:
        "bg-primary text-primary-foreground shadow-[inset_0_-3px_0_var(--primary-strong)] hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90",
      ink: "bg-foreground text-background hover:bg-foreground/90 hover:text-background dark:hover:bg-foreground/90",
      outline: "border-2 border-border bg-transparent hover:bg-muted dark:hover:bg-muted",
      ghost: "bg-transparent hover:bg-muted dark:hover:bg-muted",
      // no escuro o vermelho clareia: texto escuro mantém contraste AA
      danger:
        "bg-destructive text-white hover:bg-destructive/90 dark:hover:bg-destructive/90 hover:text-white dark:text-ink dark:hover:text-ink",
    },
    size: {
      md: "h-12 rounded-lg px-5 text-base",
      lg: "h-14 rounded-lg px-6 text-base",
      icon: "size-11 rounded-lg",
    },
  },
  defaultVariants: { tone: "primary", size: "md" },
});
