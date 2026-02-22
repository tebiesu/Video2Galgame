"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function FancySelect({ value, options, onChange, disabled, placeholder }: Props): React.ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((x) => x.value === value);

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  return (
    <div
      className={`fancy-select ${open ? "open" : ""}`}
      ref={rootRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="fancy-trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setOpen((x) => !x);
        }}
        disabled={disabled}
      >
        <span>{selected?.label || placeholder || "请选择"}</span>
        <i aria-hidden />
      </button>

      {open ? (
        <div className="fancy-menu">
          {options.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`fancy-option ${item.value === value ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onChange(item.value);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
