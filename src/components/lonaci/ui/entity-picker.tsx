"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";

import { Button } from "@/components/lonaci/ui/button";
import { FormField } from "@/components/lonaci/ui/form-field";
import { cn } from "@/lib/ui/cn";

export interface EntityPickerProps<TEntity> {
  id?: string;
  label: ReactNode;
  selected: TEntity | null;
  onSelectedChange: (entity: TEntity | null) => void;
  loadOptions: (query: string) => Promise<readonly TEntity[]>;
  getOptionKey: (entity: TEntity) => string;
  getOptionLabel: (entity: TEntity) => string;
  renderOption?: (entity: TEntity) => ReactNode;
  disabled?: boolean;
  showClearLink?: boolean;
  searchPlaceholder?: string;
  minQueryLength?: number;
  debounceMs?: number;
  inputClassName?: string;
  loadingMessage?: ReactNode;
  emptyMessage?: ReactNode;
  clearLabel?: ReactNode;
  resultsAriaLabel: string;
}

export function EntityPicker<TEntity>({
  id,
  label,
  selected,
  onSelectedChange,
  loadOptions,
  getOptionKey,
  getOptionLabel,
  renderOption = getOptionLabel,
  disabled = false,
  showClearLink = true,
  searchPlaceholder,
  minQueryLength = 2,
  debounceMs = 320,
  inputClassName,
  loadingMessage = "Recherche…",
  emptyMessage = "Aucun résultat.",
  clearLabel = "Effacer la sélection",
  resultsAriaLabel,
}: EntityPickerProps<TEntity>) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${inputId}-listbox`;
  const minLength = Math.max(1, minQueryLength);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly TEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (selected) return;
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < minLength) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      void loadOptions(normalizedQuery)
        .then((options) => {
          if (cancelled) return;
          setResults(options);
          setActiveIndex((current) =>
            options.length === 0 ? -1 : Math.min(Math.max(current, 0), options.length - 1),
          );
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setActiveIndex(-1);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, Math.max(0, debounceMs));

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [debounceMs, loadOptions, minLength, query, selected]);

  useEffect(() => {
    if (!expanded || activeIndex < 0) return;
    document.getElementById(`${listboxId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded, listboxId]);

  const pick = useCallback(
    (entity: TEntity) => {
      onSelectedChange(entity);
      setQuery(getOptionLabel(entity));
      setResults([]);
      setLoading(false);
      setExpanded(false);
      setActiveIndex(-1);
    },
    [getOptionLabel, onSelectedChange],
  );

  const clear = useCallback(() => {
    onSelectedChange(null);
    setQuery("");
    setResults([]);
    setLoading(false);
    setExpanded(false);
    setActiveIndex(-1);
  }, [onSelectedChange]);

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      const hasMinimumLength = value.trim().length >= minLength;
      setExpanded(hasMinimumLength);
      setActiveIndex(-1);
      if (!hasMinimumLength) {
        setResults([]);
        setLoading(false);
      }
      if (selected && value.trim() !== getOptionLabel(selected).trim()) {
        onSelectedChange(null);
      }
    },
    [getOptionLabel, minLength, onSelectedChange, selected],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          setExpanded(true);
          setActiveIndex((current) => Math.min(current + 1, results.length - 1));
          return;
        }
        case "ArrowUp": {
          event.preventDefault();
          setExpanded(true);
          setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
          return;
        }
        case "Home": {
          if (!expanded || results.length === 0) return;
          event.preventDefault();
          setActiveIndex(0);
          return;
        }
        case "End": {
          if (!expanded || results.length === 0) return;
          event.preventDefault();
          setActiveIndex(results.length - 1);
          return;
        }
        case "Enter": {
          const activeOption = results[activeIndex];
          if (!expanded || activeOption === undefined) return;
          event.preventDefault();
          pick(activeOption);
          return;
        }
        case "Escape": {
          if (!expanded) return;
          event.preventDefault();
          setExpanded(false);
          setActiveIndex(-1);
          return;
        }
        default:
          return;
      }
    },
    [activeIndex, expanded, pick, results],
  );

  const selectedLabel = selected ? getOptionLabel(selected) : "";
  const displayedQuery = selected ? selectedLabel : query;
  const showPanel =
    expanded &&
    query.trim().length >= minLength &&
    (!selected || selectedLabel.trim() !== query.trim());
  const activeDescendant =
    showPanel && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <FormField label={label} htmlFor={inputId}>
      <div className="relative">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showPanel}
          aria-activedescendant={activeDescendant}
          aria-haspopup="listbox"
          autoComplete="off"
          disabled={disabled}
          value={displayedQuery}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => {
            if (!selected && query.trim().length >= minLength) setExpanded(true);
          }}
          onBlur={() => {
            setExpanded(false);
            setActiveIndex(-1);
          }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          className={inputClassName}
        />
        {showClearLink && selected ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-auto min-h-0 w-fit justify-start px-0 py-0 text-xs text-cyan-700 underline-offset-2 hover:underline"
            onClick={clear}
          >
            {clearLabel}
          </Button>
        ) : null}
      </div>

      {showPanel ? (
        <div className="grid gap-1">
          {loading ? (
            <p className="text-xs text-slate-500" role="status">
              {loadingMessage}
            </p>
          ) : null}
          {!loading && results.length === 0 ? (
            <p className="text-xs text-slate-500" role="status">
              {emptyMessage}
            </p>
          ) : null}
          {results.length > 0 ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label={resultsAriaLabel}
              className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              {results.map((entity, index) => (
                <div
                  id={`${listboxId}-option-${index}`}
                  key={getOptionKey(entity)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(entity)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    "cursor-pointer border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 transition-colors last:border-b-0",
                    index === activeIndex ? "bg-cyan-50" : "hover:bg-cyan-50",
                  )}
                >
                  {renderOption(entity)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </FormField>
  );
}
