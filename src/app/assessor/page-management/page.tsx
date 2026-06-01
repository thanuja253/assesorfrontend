"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAssessorCompaniesFilters,
  listAssessorProjects,
  type AssessorProjectListFilters,
  type AssessorProjectListItem,
} from "@/lib/auth-api";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

type FiltersState = Required<AssessorProjectListFilters>;
type FilterErrors = Partial<Record<"project_id" | "email" | "mobile" | "turnover", string>>;

const DEFAULT_FILTERS: FiltersState = {
  reg_id: "",
  company_id: "",
  project_id: "",
  name: "",
  mobile: "",
  email: "",
  status: "",
  account_status: "",
  state: "",
  industry: "",
  sector: "",
  entity: "",
  fromturnover: "",
  toturnover: "",
  turnover_min: "",
  turnover_max: "",
  search: "",
};

const DEFAULT_PAGE_SIZE = 10;
type Option = { value: string; label: string };
const DEFAULT_ACCOUNT_STATUS_OPTIONS: Option[] = [
  { value: "1", label: "Active" },
  { value: "0", label: "In Active" },
];

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return asText(rec.name ?? rec.label ?? rec.value ?? "");
  }
  return "";
}

function FilterSearchableInput({
  id,
  value,
  onChange,
  options,
  placeholder = "All",
}: Readonly<{
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: Option[];
  placeholder?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [searchTerm, setSearchTerm] = useState("");
  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, searchTerm]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          globalThis.window?.setTimeout(() => setOpen(false), 120);
        }}
        placeholder={placeholder}
        className="w-full rounded border border-[#d8dfe9] bg-white px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:border-[#5f9f77] focus:ring-0 focus-visible:ring-0"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#8ba0b0]">▾</span>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded border border-[#d8dfe9] bg-white shadow">
          <div className="border-b border-[#e7edf5] p-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-[#d8dfe9] bg-white px-2 py-1.5 text-xs text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:border-[#5f9f77] focus:ring-0 focus-visible:ring-0"
            />
          </div>
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#7a8798]">No options found</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setQuery(option.label);
                  onChange(option.label);
                  setSearchTerm("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-[#2f3a46] hover:bg-[#f3f8f4]"
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function cleanFilters(filters: FiltersState): AssessorProjectListFilters {
  const result: AssessorProjectListFilters = {};
  const companyId = filters.company_id.trim();
  const projectId = filters.project_id.trim();
  const name = filters.name.trim();
  const mobile = filters.mobile.trim();
  const email = filters.email.trim();
  const accountStatus = filters.account_status.trim();
  const state = filters.state.trim();
  const industry = filters.industry.trim();
  const sector = filters.sector.trim();
  const entity = filters.entity.trim();
  const turnoverMin = filters.turnover_min.trim();
  const turnoverMax = filters.turnover_max.trim();
  const search = filters.search.trim();

  if (companyId) {
    result.company_id = companyId;
    result.reg_id = companyId;
  }
  if (projectId) {
    result.project_id = projectId;
  }
  if (name) {
    result.name = name;
  }
  if (mobile) {
    result.mobile = mobile;
  }
  if (email) {
    result.email = email;
  }
  if (accountStatus) {
    result.account_status = accountStatus;
    result.status = accountStatus;
  }
  if (state) {
    result.state = state;
  }
  if (industry) {
    result.industry = industry;
  }
  if (sector) {
    result.sector = sector;
  }
  if (entity) {
    result.entity = entity;
  }
  if (turnoverMin) {
    result.turnover_min = turnoverMin;
    result.fromturnover = turnoverMin;
  }
  if (turnoverMax) {
    result.turnover_max = turnoverMax;
    result.toturnover = turnoverMax;
  }
  if (search) {
    result.search = search;
  }
  return result;
}

function accountStatusText(row: AssessorProjectListItem): string {
  const label = row.account_status_label?.trim();
  if (label) {
    return label;
  }
  const value = String(row.account_status ?? "").toLowerCase().trim();
  if (value === "1" || value === "active") {
    return "Active";
  }
  if (value === "0" || value === "in active" || value === "inactive") {
    return "In Active";
  }
  return "—";
}

export default function AssessorProjectManagementPage() {
  const [draftFilters, setDraftFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [showFilters, setShowFilters] = useState(false);
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [industryOptions, setIndustryOptions] = useState<Option[]>([]);
  const [entityOptions, setEntityOptions] = useState<Option[]>([]);
  const [stateOptions, setStateOptions] = useState<Option[]>([]);
  const [sectorOptions, setSectorOptions] = useState<Option[]>([]);
  const [accountStatusOptions, setAccountStatusOptions] = useState<Option[]>(DEFAULT_ACCOUNT_STATUS_OPTIONS);

  const listCacheKey = useMemo(() => {
    const filters = cleanFilters(appliedFilters);
    return `${page}:${pageSize}:${JSON.stringify(filters)}`;
  }, [appliedFilters, page, pageSize]);

  const fetchProjectList = useCallback(
    () =>
      listAssessorProjects({
        ...cleanFilters(appliedFilters),
        draw: page,
        start: (page - 1) * pageSize,
        length: pageSize,
        page,
        limit: pageSize,
      }),
    [appliedFilters, page, pageSize],
  );

  const {
    data: listResult,
    loading,
    error: listError,
  } = useCachedFetch(fetchProjectList, {
    scope: "listing",
    cacheKey: listCacheKey,
  });

  const rows = listResult?.items ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!listError) {
      setErrorMessage("");
      return;
    }
    setErrorMessage(listError);
  }, [listError]);

  const toFilterOptions = useCallback((list: unknown[]): Option[] => {
    return list
      .map((item) => {
        if (typeof item === "string") return { value: item, label: item };
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const label = asText(rec.name ?? rec.label ?? rec.value ?? rec.industry ?? rec.entity ?? rec.state ?? "");
        const value = asText(rec.id ?? rec.code ?? rec.value ?? label);
        if (!label && !value) return null;
        return { value: value || label, label: label || value };
      })
      .filter((item): item is Option => item !== null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFilterOptions = async () => {
      try {
        const filtersPayload = await fetchAssessorCompaniesFilters();
        if (cancelled) return;

        setIndustryOptions(toFilterOptions(filtersPayload.industries));
        setEntityOptions(toFilterOptions(filtersPayload.entities));
        setStateOptions(toFilterOptions(filtersPayload.states));
        setSectorOptions(toFilterOptions(filtersPayload.sectors));
        setAccountStatusOptions(
          toFilterOptions(filtersPayload.account_statuses).map((option) => {
            const normalized = option.label.trim().toLowerCase();
            if (normalized === "active") return { value: "1", label: option.label };
            if (normalized === "in active" || normalized === "inactive") return { value: "0", label: option.label };
            if (option.value === "1" || option.value === "0") return option;
            return option;
          }),
        );
      } catch {
        if (!cancelled) {
          setIndustryOptions([]);
          setEntityOptions([]);
          setStateOptions([]);
          setSectorOptions([]);
          setAccountStatusOptions(DEFAULT_ACCOUNT_STATUS_OPTIONS);
        }
      }
    };
    void loadFilterOptions();
    return () => {
      cancelled = true;
    };
  }, [toFilterOptions]);

  const onSearch = () => {
    const nextErrors: FilterErrors = {};
    const projectId = draftFilters.project_id.trim();
    const email = draftFilters.email.trim();
    const mobile = draftFilters.mobile.trim();
    const turnoverMin = draftFilters.turnover_min.trim();
    const turnoverMax = draftFilters.turnover_max.trim();

    if (projectId && !/^[a-zA-Z0-9\-_/]+$/.test(projectId)) {
      nextErrors.project_id = "Project Id contains invalid characters.";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (mobile && !/^\d{10}$/.test(mobile)) {
      nextErrors.mobile = "Phone Number must be exactly 10 digits.";
    }
    if ((turnoverMin && Number.isNaN(Number(turnoverMin))) || (turnoverMax && Number.isNaN(Number(turnoverMax)))) {
      nextErrors.turnover = "Turnover values must be numeric.";
    } else if (turnoverMin && turnoverMax && Number(turnoverMin) > Number(turnoverMax)) {
      nextErrors.turnover = "From value cannot be greater than To value.";
    }

    setFilterErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setPage(1);
    setAppliedFilters(draftFilters);
  };

  const onReset = () => {
    setPage(1);
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setFilterErrors({});
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(page * pageSize, total);
  let tableContent: ReactNode;

  if (loading) {
    tableContent = (
      <tr>
        <td colSpan={8} className="px-3 py-7 text-center text-[#7a8798]">
          Loading projects...
        </td>
      </tr>
    );
  } else if (rows.length === 0) {
    tableContent = (
      <tr>
        <td colSpan={8} className="px-3 py-7 text-center text-[#7a8798]">
          No assigned projects found.
        </td>
      </tr>
    );
  } else {
    tableContent = rows.map((row, idx) => (
      <tr key={`${row.id ?? row.quickview_project_id ?? row.project_id ?? "row"}-${idx}`}>
        <td className="px-3 py-2 text-[#445063]">{(page - 1) * pageSize + idx + 1}</td>
        <td className="px-3 py-2 text-[#2f3a46]">{row.company_id ?? "—"}</td>
        <td className="px-3 py-2 text-[#2f3a46]">{row.project_id ?? "—"}</td>
        <td className="px-3 py-2 text-[#2f3a46]">{row.name ?? "—"}</td>
        <td className="px-3 py-2 text-[#2f3a46]">{row.email ?? "—"}</td>
        <td className="px-3 py-2 text-[#2f3a46]">{row.mobile ?? "—"}</td>
        <td className="px-3 py-2">
          <span className="rounded bg-[#e8f5ea] px-2 py-1 text-xs font-semibold text-[#2f8b4f]">
            {accountStatusText(row)}
          </span>
        </td>
        <td className="px-3 py-2">
          {row.id ?? row.quickview_project_id ? (
            <a
              href={`/assessor/page-management/${encodeURIComponent(
                row.id ?? row.quickview_project_id ?? "",
              )}/quick-view`}
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#cfe1f4] bg-[#f4f9ff] text-xs text-[#3b79b3] hover:bg-[#e8f3ff]"
              title="Quick View"
              aria-label="Quick View"
            >
              ✎
            </a>
          ) : (
            <span className="text-xs text-[#98a4b5]">—</span>
          )}
        </td>
      </tr>
    ));
  }

  return (
    <section className="rounded border border-[#dfe3ec] bg-white">
      <div className="border-b border-[#e8edf4] px-4 py-3">
        <h1 className="text-base font-semibold text-[#2f3a46]">Project Management</h1>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded bg-[#2f8f4e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#267641]"
          >
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" aria-hidden>
              <path d="M3.5 4.5H16.5L11.5 10.3V15.2L8.5 16.7V10.3L3.5 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Filters</span>
          </button>
        </div>

        {showFilters ? (
          <div className="space-y-3 rounded border border-[#d8dfe9] bg-[#fafcff] p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <label htmlFor="filter-company-id" className="text-xs text-[#5f6b7a]">
                  Company Id
                </label>
                <input
                  id="filter-company-id"
                  value={draftFilters.company_id}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, company_id: e.target.value }))
                  }
                  placeholder="Company Id"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:border-[#5f9f77] focus:ring-0 focus-visible:ring-0"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-project-id" className="text-xs text-[#5f6b7a]">
                  Project Id <span className="text-[#d63f3f]">*</span>
                </label>
                <input
                  id="filter-project-id"
                  value={draftFilters.project_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftFilters((prev) => ({ ...prev, project_id: value }));
                    if (value.trim() && !/^[a-zA-Z0-9\-_/]+$/.test(value.trim())) {
                      setFilterErrors((prev) => ({
                        ...prev,
                        project_id: "Project Id contains invalid characters.",
                      }));
                    } else {
                      setFilterErrors((prev) => ({ ...prev, project_id: undefined }));
                    }
                  }}
                  placeholder="Project Id"
                  className={`w-full rounded px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:ring-0 focus-visible:ring-0 ${
                    filterErrors.project_id
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#5f9f77]"
                  }`}
                />
                {filterErrors.project_id ? (
                  <p className="text-xs text-[#d63f3f]">{filterErrors.project_id}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-name" className="text-xs text-[#5f6b7a]">
                  Name
                </label>
                <input
                  id="filter-name"
                  value={draftFilters.name}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Name"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:border-[#5f9f77] focus:ring-0 focus-visible:ring-0"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-email" className="text-xs text-[#5f6b7a]">
                  Email Address
                </label>
                <input
                  id="filter-email"
                  value={draftFilters.email}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftFilters((prev) => ({ ...prev, email: value }));
                    if (value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
                      setFilterErrors((prev) => ({
                        ...prev,
                        email: "Enter a valid email address.",
                      }));
                    } else {
                      setFilterErrors((prev) => ({ ...prev, email: undefined }));
                    }
                  }}
                  placeholder="Email Address"
                  className={`w-full rounded px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:ring-0 focus-visible:ring-0 ${
                    filterErrors.email
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#5f9f77]"
                  }`}
                />
                {filterErrors.email ? (
                  <p className="text-xs text-[#d63f3f]">{filterErrors.email}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-mobile" className="text-xs text-[#5f6b7a]">
                  Phone Number
                </label>
                <input
                  id="filter-mobile"
                  value={draftFilters.mobile}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftFilters((prev) => ({ ...prev, mobile: value }));
                    if (value.trim() && !/^\d{10}$/.test(value.trim())) {
                      setFilterErrors((prev) => ({
                        ...prev,
                        mobile: "Phone Number must be exactly 10 digits.",
                      }));
                    } else {
                      setFilterErrors((prev) => ({ ...prev, mobile: undefined }));
                    }
                  }}
                  placeholder="Phone Number"
                  className={`w-full rounded px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] focus:ring-0 focus-visible:ring-0 ${
                    filterErrors.mobile
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#5f9f77]"
                  }`}
                />
                {filterErrors.mobile ? (
                  <p className="text-xs text-[#d63f3f]">{filterErrors.mobile}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-state" className="text-xs text-[#5f6b7a]">
                  State
                </label>
                <FilterSearchableInput
                  id="filter-state"
                  value={draftFilters.state}
                  onChange={(next) => setDraftFilters((prev) => ({ ...prev, state: next }))}
                  options={stateOptions}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-industry" className="text-xs text-[#5f6b7a]">
                  Type of the Industry
                </label>
                <FilterSearchableInput
                  id="filter-industry"
                  value={draftFilters.industry}
                  onChange={(next) => setDraftFilters((prev) => ({ ...prev, industry: next }))}
                  options={industryOptions}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-sector" className="text-xs text-[#5f6b7a]">
                  Type of Sector
                </label>
                <FilterSearchableInput
                  id="filter-sector"
                  value={draftFilters.sector}
                  onChange={(next) => setDraftFilters((prev) => ({ ...prev, sector: next }))}
                  options={sectorOptions}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-entity" className="text-xs text-[#5f6b7a]">
                  Type of the Entity
                </label>
                <FilterSearchableInput
                  id="filter-entity"
                  value={draftFilters.entity}
                  onChange={(next) => setDraftFilters((prev) => ({ ...prev, entity: next }))}
                  options={entityOptions}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-turnover-min" className="text-xs text-[#5f6b7a]">
                  Turnover Range (in Crs)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    id="filter-turnover-min"
                    value={draftFilters.turnover_min}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraftFilters((prev) => ({ ...prev, turnover_min: value }));
                      const min = value.trim();
                      const max = draftFilters.turnover_max.trim();
                      if ((min && Number.isNaN(Number(min))) || (max && Number.isNaN(Number(max)))) {
                        setFilterErrors((prev) => ({
                          ...prev,
                          turnover: "Turnover values must be numeric.",
                        }));
                      } else if (min && max && Number(min) > Number(max)) {
                        setFilterErrors((prev) => ({
                          ...prev,
                          turnover: "From value cannot be greater than To value.",
                        }));
                      } else {
                        setFilterErrors((prev) => ({ ...prev, turnover: undefined }));
                      }
                    }}
                    placeholder="from value"
                    className={`w-full rounded px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] ${
                      filterErrors.turnover
                        ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                        : "border border-[#d8dfe9] focus:border-[#5f9f77]"
                    }`}
                  />
                  <input
                    id="filter-turnover-max"
                    value={draftFilters.turnover_max}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDraftFilters((prev) => ({ ...prev, turnover_max: value }));
                      const min = draftFilters.turnover_min.trim();
                      const max = value.trim();
                      if ((min && Number.isNaN(Number(min))) || (max && Number.isNaN(Number(max)))) {
                        setFilterErrors((prev) => ({
                          ...prev,
                          turnover: "Turnover values must be numeric.",
                        }));
                      } else if (min && max && Number(min) > Number(max)) {
                        setFilterErrors((prev) => ({
                          ...prev,
                          turnover: "From value cannot be greater than To value.",
                        }));
                      } else {
                        setFilterErrors((prev) => ({ ...prev, turnover: undefined }));
                      }
                    }}
                    placeholder="to value"
                    className={`w-full rounded px-3 py-1.5 text-sm text-[#2f3a46] outline-none placeholder:text-[#99a4b5] ${
                      filterErrors.turnover
                        ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                        : "border border-[#d8dfe9] focus:border-[#5f9f77]"
                    }`}
                  />
                </div>
                {filterErrors.turnover ? (
                  <p className="text-xs text-[#d63f3f]">{filterErrors.turnover}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-account-status" className="text-xs text-[#5f6b7a]">
                  Account Status
                </label>
                <FilterSearchableInput
                  id="filter-account-status"
                  value={draftFilters.account_status}
                  onChange={(next) => {
                    const normalized = next.trim().toLowerCase();
                    if (normalized === "active" || normalized === "1") {
                      setDraftFilters((prev) => ({ ...prev, account_status: "1" }));
                    } else if (normalized === "in active" || normalized === "inactive" || normalized === "0") {
                      setDraftFilters((prev) => ({ ...prev, account_status: "0" }));
                    } else if (!normalized || normalized === "all") {
                      setDraftFilters((prev) => ({ ...prev, account_status: "" }));
                    } else {
                      setDraftFilters((prev) => ({ ...prev, account_status: next }));
                    }
                  }}
                  options={accountStatusOptions}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onSearch}
                className="rounded bg-[#2f8f4e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#267641]"
              >
                Search
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded border border-[#b9d8c3] bg-[#eff9f2] px-3 py-1.5 text-xs text-[#2b6b43] hover:bg-[#e0f3e6]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="rounded border border-[#f3c9cf] bg-[#fff2f3] px-3 py-2 text-sm text-[#b14456]">
            {errorMessage}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded border border-[#e5eaf1]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f4f7fb] text-xs uppercase tracking-wide text-[#5d6a7a]">
              <tr>
                <th className="px-3 py-2">S.No</th>
                <th className="px-3 py-2">Company ID</th>
                <th className="px-3 py-2">Project ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Phone Number</th>
                <th className="px-3 py-2">Account Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">{tableContent}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
