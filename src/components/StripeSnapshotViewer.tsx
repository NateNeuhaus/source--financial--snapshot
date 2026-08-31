import { useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";


type StripeCustomer = {
  id: string;
  name?: string | null;
  currency?: string | null;
  delinquent?: boolean;
  [key: string]: unknown;
};

type StripePrice = {
  unit_amount?: number | null;
  unit_amount_decimal?: string | number | null;
  currency?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null } | null;
};

type StripeSubscription = {
  customer?: string | { id?: string } | null;
  status?: string | null;
  currency?: string | null;
  quantity?: number | null;
  items?: { data?: Array<{ price?: StripePrice | null; quantity?: number | null }> } | null;
  plan?: { amount?: number | null; currency?: string | null; interval?: string | null; interval_count?: number | null } | null;
  [key: string]: unknown;
};

type SnapshotSummary = {
  customer_count?: number;
  subscription_count?: number;
  active_subscription_count?: number;
  delinquent_customer_count?: number;
  customers_requiring_attention?: number;
  [key: string]: unknown;
};

type StripeSnapshot = {
  collected_at?: string;
  summary?: SnapshotSummary;
  current?: { customers?: StripeCustomer[]; subscriptions?: StripeSubscription[] };
  [key: string]: unknown;
};

type CustomerEntry = {
  customer: StripeCustomer;
  subscriptions: StripeSubscription[];
  recurringSubscriptions: StripeSubscription[];
  primarySubscription: StripeSubscription | null;
  monthlyAmount: number;
  currency: string;
};

export default function StripeSnapshotViewer() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [snapshot, setSnapshot] = useState<StripeSnapshot | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");

  /* =========================================================
     FILE LOADING
  ========================================================= */

  const loadFile = (file: File) => {
    if (!file) return;

    setError("");

    const reader = new FileReader();

    reader.onload = () => {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("File contents were not text.");
        }
        const parsed = JSON.parse(reader.result) as StripeSnapshot;

        setSnapshot(parsed);
        setFileName(file.name);
        setSearch("");
      } catch {
        setSnapshot(null);
        setFileName("");
        setError("Could not parse this file as JSON.");
      }
    };

    reader.onerror = () => {
      setError("Could not read the selected file.");
    };

    reader.readAsText(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      loadFile(file);
    }
  };

  /* =========================================================
     SNAPSHOT DATA
  ========================================================= */

  const summary = snapshot?.summary || {};

  const customers =
    snapshot?.current?.customers || [];

  const subscriptions =
    snapshot?.current?.subscriptions || [];

  /* =========================================================
     GROUP SUBSCRIPTIONS BY CUSTOMER
  ========================================================= */

  const subscriptionsByCustomer = useMemo(() => {
    const map = new Map<string, StripeSubscription[]>();

    for (const subscription of subscriptions) {
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;

      if (!customerId) continue;

      if (!map.has(customerId)) {
        map.set(customerId, []);
      }

      map.get(customerId)!.push(subscription);
    }

    return map;
  }, [subscriptions]);

  /* =========================================================
     BUILD CUSTOMER TABLE DATA
  ========================================================= */

  const customerData = useMemo(() => {
    return customers.map((customer) => {
      const customerSubscriptions =
        subscriptionsByCustomer.get(customer.id) || [];

      const recurringSubscriptions =
        customerSubscriptions.filter((subscription) =>
          ["active", "trialing", "past_due"].includes(
            subscription.status ?? ""
          )
        );

      let monthlyAmount = 0;
      let currency = customer.currency || "usd";

      for (const subscription of recurringSubscriptions) {
        const result =
          calculateSubscriptionMonthly(subscription);

        monthlyAmount += result.amount;

        if (result.currency) {
          currency = result.currency;
        }
      }

      const primarySubscription =
        recurringSubscriptions[0] ||
        customerSubscriptions[0] ||
        null;

      return {
        customer,
        subscriptions: customerSubscriptions,
        recurringSubscriptions,
        primarySubscription,
        monthlyAmount,
        currency,
      };
    });
  }, [customers, subscriptionsByCustomer]);

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return customerData;
    }

    return customerData.filter(({ customer }) => {
      return (
        (customer.name || "")
          .toLowerCase()
          .includes(query) ||
        (customer.id || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [customerData, search]);

  /* =========================================================
     SNAPSHOT DATE
  ========================================================= */

  const snapshotTime = useMemo(() => {
    if (!snapshot?.collected_at) {
      return "";
    }

    const date = new Date(snapshot.collected_at);

    if (Number.isNaN(date.getTime())) {
      return snapshot.collected_at;
    }

    return date.toLocaleString(undefined, {
      dateStyle: "full",
      timeStyle: "medium",
    });
  }, [snapshot]);

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="stripe-snapshot-page">
      <style>{styles}</style>

      <main className="container">
        <div className="page-heading">
          <div>
            <h1>Stripe Financial Snapshot</h1>

            <p>
              Drop a Stripe financial snapshot JSON file to
              inspect it locally.
            </p>
          </div>
        </div>

        {/* DROP ZONE */}

        <div
          className={`drop-zone ${dragging ? "dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();

            const relatedTarget = event.relatedTarget;

            if (
              !relatedTarget ||
              !(relatedTarget instanceof Node) ||
              !event.currentTarget.contains(relatedTarget)
            ) {
              setDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <div className="drop-icon">⇩</div>

          <div className="drop-title">
            Drop your snapshot JSON here
          </div>

          <div className="drop-help">
            or click to select a .json file
          </div>

          {fileName && (
            <div className="loaded-file">
              ✓ {fileName}
            </div>
          )}

          {error && (
            <div className="error">
              {error}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              loadFile(file);
            }

            event.target.value = "";
          }}
        />

        {/* DASHBOARD */}

        {snapshot && (
          <>
            <div className="snapshot-header">
              <div>
                <strong>Financial Snapshot</strong>

                <div className="snapshot-time">
                  {snapshotTime
                    ? `Snapshot taken ${snapshotTime}`
                    : "Snapshot date unavailable"}
                </div>
              </div>

              <span className="badge">
                Loaded Snapshot
              </span>
            </div>

            {/* SUMMARY */}

            <section className="summary-grid">
              <SummaryCard
                label="Customers"
                value={
                  summary.customer_count ??
                  customers.length
                }
              />

              <SummaryCard
                label="Subscriptions"
                value={
                  summary.subscription_count ??
                  subscriptions.length
                }
              />

              <SummaryCard
                label="Active"
                value={
                  summary.active_subscription_count ??
                  "—"
                }
              />

              <SummaryCard
                label="Delinquent"
                value={
                  summary.delinquent_customer_count ??
                  "—"
                }
              />

              <SummaryCard
                label="Require Attention"
                value={
                  summary.customers_requiring_attention ??
                  "—"
                }
              />
            </section>

            {/* CUSTOMERS */}

            <section className="table-card">
              <div className="table-header">
                <h2>Customers</h2>

                <input
                  type="search"
                  className="search"
                  placeholder="Search name or customer ID..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Customer ID</th>
                      <th>Monthly Payment</th>
                      <th>Subscription</th>
                      <th>Account</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredCustomers.map((entry) => (
                      <CustomerRow
                        key={entry.customer.id}
                        entry={entry}
                      />
                    ))}

                    {!filteredCustomers.length && (
                      <tr>
                        <td
                          colSpan={5}
                          className="empty"
                        >
                          No matching customers.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="footer">
                {filteredCustomers.length.toLocaleString()}{" "}
                customer
                {filteredCustomers.length === 1
                  ? ""
                  : "s"}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="summary-card">
      <div className="summary-label">
        {label}
      </div>

      <div className="summary-value">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
   CUSTOMER ROW
========================================================= */

function CustomerRow({ entry }: { entry: CustomerEntry }) {
  const {
    customer,
    subscriptions,
    primarySubscription,
    monthlyAmount,
    currency,
  } = entry;

  const status =
    primarySubscription?.status || "none";

  let statusClass = "neutral";

  if (
    status === "active" ||
    status === "trialing"
  ) {
    statusClass = "active";
  }

  if (
    status === "past_due" ||
    status === "unpaid"
  ) {
    statusClass = "bad";
  }

  return (
    <tr>
      <td>
        <span className="name">
          {customer.name || "Unnamed customer"}
        </span>
      </td>

      <td>
        <span className="id">
          {customer.id}
        </span>
      </td>

      <td>
        {monthlyAmount > 0 ? (
          <span className="money">
            {formatMoney(
              monthlyAmount,
              currency
            )}{" "}
            / mo
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>

      <td>
        {subscriptions.length ? (
          <span
            className={`status ${statusClass}`}
          >
            {status}
          </span>
        ) : (
          <span className="status neutral">
            None
          </span>
        )}
      </td>

      <td>
        {customer.delinquent ? (
          <span className="status bad">
            Delinquent
          </span>
        ) : (
          <span className="status active">
            OK
          </span>
        )}
      </td>
    </tr>
  );
}

/* =========================================================
   STRIPE CALCULATIONS
========================================================= */

function calculateSubscriptionMonthly(subscription: StripeSubscription): { amount: number; currency: string | null } {
  let total = 0;
  let currency = null;

  const items =
    subscription.items?.data || [];

  for (const item of items) {
    const price = item.price || {};

    const quantity =
      Number(item.quantity || 1);

    let amount = Number(
      price.unit_amount ??
      price.unit_amount_decimal ??
      0
    );

    if (!Number.isFinite(amount)) {
      amount = 0;
    }

    currency =
      price.currency ||
      subscription.currency ||
      currency;

    const recurring =
      price.recurring || {};

    total += monthlyEquivalent(
      amount * quantity,
      recurring.interval,
      recurring.interval_count || 1
    );
  }

  /*
   * Fallback for older Stripe plan objects.
   */

  if (!items.length && subscription.plan) {
    const plan = subscription.plan;

    currency =
      plan.currency ||
      subscription.currency ||
      currency;

    total += monthlyEquivalent(
      Number(plan.amount || 0) *
        Number(subscription.quantity || 1),
      plan.interval,
      plan.interval_count || 1
    );
  }

  return {
    amount: total,
    currency,
  };
}

function monthlyEquivalent(
  amount: number,
  interval?: string | null,
  intervalCount: number = 1
) {
  intervalCount =
    Number(intervalCount) || 1;

  switch (interval) {
    case "day":
      return (
        amount *
        (30.4375 / intervalCount)
      );

    case "week":
      return (
        amount *
        ((52 / 12) / intervalCount)
      );

    case "month":
      return amount / intervalCount;

    case "year":
      return (
        amount /
        (12 * intervalCount)
      );

    default:
      return amount;
  }
}

function formatMoney(
  cents: number,
  currency: string = "usd"
) {
  try {
    return new Intl.NumberFormat(
      undefined,
      {
        style: "currency",
        currency:
          currency.toUpperCase(),
      }
    ).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(
      2
    )} ${currency.toUpperCase()}`;
  }
}

/* =========================================================
   STYLES
========================================================= */

const styles = `
  * {
    box-sizing: border-box;
  }

  .stripe-snapshot-page {
    --bg: #f5f6f8;
    --card: #ffffff;
    --border: #e3e6eb;
    --text: #111827;
    --muted: #6b7280;
    --green: #15803d;
    --green-bg: #dcfce7;
    --red: #b91c1c;
    --red-bg: #fee2e2;
    --purple: #635bff;

    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    padding: 1px 0;
  }

  .container {
    width: min(1400px, calc(100% - 40px));
    margin: 40px auto;
  }

  .page-heading h1 {
    margin: 0 0 6px;
    font-size: 28px;
    letter-spacing: -0.03em;
  }

  .page-heading p {
    margin: 0 0 26px;
    color: var(--muted);
    font-size: 14px;
  }

  .drop-zone {
    background: white;
    border: 2px dashed #c8ccd4;
    border-radius: 16px;
    padding: 45px 30px;
    text-align: center;
    cursor: pointer;
    transition: 0.2s;
    margin-bottom: 28px;
  }

  .drop-zone:hover,
  .drop-zone.dragging {
    border-color: var(--purple);
    background: #f8f7ff;
  }

  .drop-icon {
    font-size: 34px;
    margin-bottom: 10px;
  }

  .drop-title {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 5px;
  }

  .drop-help {
    font-size: 13px;
    color: var(--muted);
  }

  .loaded-file {
    margin-top: 12px;
    color: var(--green);
    font-weight: 600;
    font-size: 13px;
  }

  .error {
    color: var(--red);
    margin-top: 10px;
    font-size: 13px;
    font-weight: 600;
  }

  .snapshot-header {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: center;
    margin-bottom: 18px;
  }

  .snapshot-time {
    margin-top: 4px;
    font-size: 14px;
    color: var(--muted);
  }

  .badge {
    background: var(--green-bg);
    color: var(--green);
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
  }

  .summary-grid {
    display: grid;
    grid-template-columns:
      repeat(5, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 26px;
  }

  .summary-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
  }

  .summary-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .summary-value {
    font-size: 27px;
    font-weight: 750;
  }

  .table-card {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .table-header {
    padding: 17px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    border-bottom: 1px solid var(--border);
  }

  .table-header h2 {
    margin: 0;
    font-size: 17px;
  }

  .search {
    width: 300px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    outline: none;
    font: inherit;
  }

  .search:focus {
    border-color: #9ca3af;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    background: #fafafa;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    padding: 11px 20px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  td {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: #fafafa;
  }

  .name {
    font-weight: 650;
  }

  .id {
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      monospace;
    color: var(--muted);
    font-size: 12px;
  }

  .money {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: #9ca3af;
  }

  .status {
    display: inline-block;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .status.active {
    background: var(--green-bg);
    color: var(--green);
  }

  .status.bad {
    background: var(--red-bg);
    color: var(--red);
  }

  .status.neutral {
    background: #f3f4f6;
    color: #4b5563;
  }

  .footer {
    padding: 12px 20px;
    background: #fafafa;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
  }

  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--muted);
  }

  @media (max-width: 900px) {
    .summary-grid {
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .container {
      width: calc(100% - 24px);
      margin: 20px auto;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .table-header {
      flex-direction: column;
      align-items: stretch;
    }

    .search {
      width: 100%;
    }

    .snapshot-header {
      align-items: flex-start;
    }
  }
`;