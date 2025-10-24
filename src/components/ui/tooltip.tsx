import * as React from "react";

// Tooltip functionality temporarily disabled due to React instance conflicts
// This is a placeholder file to prevent import errors

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => {
  return <React.Fragment>{children}</React.Fragment>;
};

export const Tooltip = ({ children }: { children: React.ReactNode }) => {
  return <React.Fragment>{children}</React.Fragment>;
};

export const TooltipTrigger = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  ({ children }, ref) => {
    return <div ref={ref}>{children}</div>;
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = ({ children }: { children: React.ReactNode }) => {
  return <React.Fragment>{children}</React.Fragment>;
};
