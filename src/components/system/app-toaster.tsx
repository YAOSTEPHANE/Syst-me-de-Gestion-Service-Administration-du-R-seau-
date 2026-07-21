"use client";

import { Toaster } from "sonner";

export default function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      expand
      visibleToasts={5}
      duration={4500}
      gap={10}
      offset={{ top: 64, right: 20 }}
      mobileOffset={{ top: 56, right: 12, left: 12 }}
      style={{ zIndex: 11000 }}
      toastOptions={{
        classNames: {
          toast: "border-slate-200 bg-white font-sans text-slate-900 shadow-xl",
          title: "font-semibold",
          description: "text-sm text-slate-600",
          actionButton: "bg-orange-500 text-white hover:bg-orange-600",
          cancelButton: "bg-slate-100 text-slate-700 hover:bg-slate-200",
          closeButton: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
        },
      }}
    />
  );
}
