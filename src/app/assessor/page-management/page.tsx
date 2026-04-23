"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  AuthApiError,
  listAssessorProjects,
  type AssessorProjectListFilters,
  type AssessorProjectListItem,
} from "@/lib/auth-api";

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
  const [rows, setRows] = useState<AssessorProjectListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [showFilters, setShowFilters] = useState(false);
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const result = await listAssessorProjects({
          ...cleanFilters(appliedFilters),
          draw: page,
          start: (page - 1) * pageSize,
          length: pageSize,
          page,
          limit: pageSize,
        });
        if (cancelled) {
          return;
        }
        setRows(result.items);
        setTotal(result.total);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof AuthApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("Unable to load project list.");
        }
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, page, pageSize]);

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
              href={`/assessor/page-management?quickview_project_id=${encodeURIComponent(
                row.id ?? row.quickview_project_id ?? "",
              )}`}
              className="rounded border border-[#cfe1f4] bg-[#f4f9ff] px-2 py-1 text-xs text-[#3b79b3] hover:bg-[#e8f3ff]"
            >
              Quick View
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[280px] flex-1 items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-[#5f6b7a]">
              <span>Show</span>
              <select
                value={String(pageSize)}
                onChange={(event) => {
                  const nextPageSize = Number(event.target.value);
                  setPage(1);
                  setPageSize(nextPageSize);
                }}
                className="rounded border border-[#d8dfe9] px-2 py-1 text-xs outline-none focus:border-[#6ea3d8]"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
            <input
              value={draftFilters.search}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSearch();
                }
              }}
              placeholder="Search"
              className="w-full max-w-[420px] rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded bg-[#5fa2dc] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4f93cf]"
          >
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
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
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
                  className={`w-full rounded px-3 py-1.5 text-sm outline-none ${
                    filterErrors.project_id
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#6ea3d8]"
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
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
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
                  className={`w-full rounded px-3 py-1.5 text-sm outline-none ${
                    filterErrors.email
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#6ea3d8]"
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
                  className={`w-full rounded px-3 py-1.5 text-sm outline-none ${
                    filterErrors.mobile
                      ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                      : "border border-[#d8dfe9] focus:border-[#6ea3d8]"
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
                <input
                  id="filter-state"
                  value={draftFilters.state}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, state: e.target.value }))}
                  placeholder="All"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-industry" className="text-xs text-[#5f6b7a]">
                  Type of the Industry
                </label>
                <input
                  id="filter-industry"
                  value={draftFilters.industry}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, industry: e.target.value }))
                  }
                  placeholder="All"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-sector" className="text-xs text-[#5f6b7a]">
                  Type of Sector
                </label>
                <input
                  id="filter-sector"
                  value={draftFilters.sector}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, sector: e.target.value }))
                  }
                  placeholder="All"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="filter-entity" className="text-xs text-[#5f6b7a]">
                  Type of the Entity
                </label>
                <input
                  id="filter-entity"
                  value={draftFilters.entity}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, entity: e.target.value }))
                  }
                  placeholder="All"
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
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
                    className={`w-full rounded px-3 py-1.5 text-sm outline-none ${
                      filterErrors.turnover
                        ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                        : "border border-[#d8dfe9] focus:border-[#6ea3d8]"
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
                    className={`w-full rounded px-3 py-1.5 text-sm outline-none ${
                      filterErrors.turnover
                        ? "border border-[#d63f3f] focus:border-[#d63f3f] focus:ring-1 focus:ring-[#f0b1b1]"
                        : "border border-[#d8dfe9] focus:border-[#6ea3d8]"
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
                <select
                  id="filter-account-status"
                  value={draftFilters.account_status}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, account_status: e.target.value }))
                  }
                  className="w-full rounded border border-[#d8dfe9] px-3 py-1.5 text-sm outline-none focus:border-[#6ea3d8]"
                >
                  <option value="">All</option>
                  <option value="1">Active</option>
                  <option value="0">In Active</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onSearch}
                className="rounded bg-[#5ea2df] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4f93cf]"
              >
                Search
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded border border-[#ced8e6] bg-[#f5f8fd] px-3 py-1.5 text-xs text-[#516173] hover:bg-[#ebf1fa]"
              >
                Reset
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

        <div className="flex flex-col items-start justify-between gap-3 text-sm text-[#6a7788] md:flex-row md:items-center">
          <p>
            Showing {start} to {end} of {total} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || loading}
              className="rounded border border-[#d2dbe8] bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="rounded bg-[#eaf1fb] px-3 py-1.5 text-[#35506b]">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages || loading}
              className="rounded border border-[#d2dbe8] bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
