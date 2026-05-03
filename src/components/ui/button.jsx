import * as React from "react";

export function Button({ className = "", variant = "default", ...props }) {
  const base =
    "inline-flex items-center justify-center text-sm font-semibold transition rounded-2xl";

  const variants = {
    default: "bg-blue-950 text-white hover:bg-blue-900 border border-blue-950",
    outline: "border border-slate-200 bg-white hover:bg-slate-50 text-slate-900",
    secondary: "bg-white text-slate-900 hover:bg-slate-100 border border-slate-200",
  };

  return (
    <button
      className={`${base} px-4 py-2.5 ${variants[variant] || variants.default} ${className}`}
      {...props}
    />
  );
}
