import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Clock3,
  CreditCard,
  Gauge,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import "./styles.css";
import StaticQR from "./StaticQR";
import DynamicQR from "./DynamicQR";
import PaymentCheckout from "./PaymentCheckout";

const API = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `Request failed (${response.status})`,
    );
  }
  return data;
}

const money = (paise, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const initials = (name = "PQ") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register")
        await request("/users/register", {
          method: "POST",
          body: JSON.stringify(form),
        });
      const result = await request("/users/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      onAuth(result.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-art">
        <div className="brand">
          <span className="brand-mark">
            <Wallet size={21} />
          </span>
          <span>
            PQ<span className="brand-accent">Pay</span>
          </span>
        </div>
        <div className="art-copy">
          <span className="eyebrow">PAYMENTS, REIMAGINED</span>
          <h1>A clearer view of every payment.</h1>
          <p>
            A focused workspace to manage merchants, run simulated transactions
            and inspect payment performance.
          </p>
        </div>
        <div className="art-bottom">
          <ShieldCheck size={17} /> Experimental security research workspace{" "}
          <span>•</span> Built for learning
        </div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand brand">
            <span className="brand-mark">
              <Wallet size={20} />
            </span>
            <span>
              PQ<span className="brand-accent">Pay</span>
            </span>
          </div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">
            {mode === "login"
              ? "Sign in to continue to your dashboard."
              : "Get started with your PQPay workspace."}
          </p>
          <form onSubmit={submit} className="form-stack">
            {mode === "register" && (
              <label>
                Full name
                <input
                  name="full_name"
                  value={form.full_name}
                  onChange={change}
                  placeholder="Your name"
                  minLength="2"
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={change}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={change}
                placeholder="At least 8 characters"
                minLength="8"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="switch-auth">
            {mode === "login" ? "New to PQPay?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="auth-note">
            <KeyRound size={14} /> Passwords are securely hashed. Sessions use
            bearer-token authentication.
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("pqpay_token"));
  const [user, setUser] = useState(null);
  const [merchants, setMerchants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastTiming, setLastTiming] = useState(null);
  const [toast, setToast] = useState("");

  const logout = useCallback(() => {
    localStorage.removeItem("pqpay_token");
    setToken(null);
    setUser(null);
    setMerchants([]);
    setPayments([]);
  }, []);
  const load = useCallback(
    async (authToken = token) => {
      if (!authToken) return;
      setLoading(true);
      setError("");
      try {
        const [me, merchantRows, paymentRows] = await Promise.all([
          request("/users/me", { token: authToken }),
          request("/merchants/", { token: authToken }),
          request("/payments/?limit=100", { token: authToken }),
        ]);
        setUser(me);
        setMerchants(merchantRows);
        setPayments(paymentRows);
        setMerchantId(
          (current) =>
            current || (merchantRows[0] ? String(merchantRows[0].id) : ""),
        );
      } catch (err) {
        if (/token|credentials|unauthorized/i.test(err.message)) logout();
        else setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [token, logout],
  );

  useEffect(() => {
    if (token) load(token);
    else setLoading(false);
  }, [token, load]);
  useEffect(() => {
    if (token) localStorage.setItem("pqpay_token", token);
  }, [token]);
  const merchantNames = useMemo(
    () => Object.fromEntries(merchants.map((m) => [m.id, m.business_name])),
    [merchants],
  );
  const total = payments.reduce((sum, p) => sum + p.amount_paise, 0);
  const successCount = payments.filter((p) => p.status === "success").length;
  const avgTime = payments.length
    ? payments.reduce((sum, p) => sum + (p.processing_time_ms || 0), 0) /
      payments.length
    : 0;

  async function createMerchant(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await request("/merchants/", {
        token,
        method: "POST",
        body: JSON.stringify({ business_name: businessName }),
      });
      setMerchants((old) => [created, ...old]);
      setMerchantId(String(created.id));
      setBusinessName("");
      setModal("");
      setToast("Merchant created successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function createPayment(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLastTiming(null);
    const started = performance.now();
    try {
      const result = await request("/payments/", {
        token,
        method: "POST",
        body: JSON.stringify({
          merchant_id: Number(merchantId),
          amount_paise: Math.round(Number(amount) * 100),
          currency: "INR",
        }),
      });
      const roundTrip = performance.now() - started;
      setLastTiming({
        backend: result.processing_time_ms,
        roundTrip,
        security: result.security_time_ms,
      });
      setPayments((old) => [result, ...old]);
      setAmount("");
      setModal("");
      setToast("Simulated payment completed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const paymentRequestToken = new URLSearchParams(window.location.search).get(
    "payment_request",
  );

  if (!token) {
    return (
      <Auth
        onAuth={(value) => {
          localStorage.setItem("pqpay_token", value);
          setToken(value);
        }}
      />
    );
  }

  if (paymentRequestToken) {
    return <PaymentCheckout token={token} requestToken={paymentRequestToken} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Wallet size={21} />
          </span>
          <span>
            PQ<span className="brand-accent">Pay</span>
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="nav-item active">
          <Gauge size={18} /> Overview
        </div>
        <div className="nav-item">
          <Building2 size={18} /> Merchants{" "}
          <span className="nav-count">{merchants.length}</span>
        </div>
        <div className="nav-item">
          <CreditCard size={18} /> Transactions
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{initials(user?.full_name)}</div>
            <div className="profile-info">
              <strong>{user?.full_name || "PQPay user"}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="icon-btn" title="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
          <div className="side-version">
            PQPay prototype <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace <span>/</span> Overview
            </div>
            <h1>Overview</h1>
          </div>
          <div className="top-actions">
            <span className="env-pill">
              <i /> Simulation environment
            </span>
            <button className="btn outline" onClick={() => load()}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setError("");
                setModal("payment");
              }}
            >
              <Plus size={17} /> Create payment
            </button>
          </div>
        </header>
        <div className="content-wrap">
          <div className="welcome-row">
            <div>
              <h2>
                Good to see you, {user?.full_name?.split(" ")[0] || "there"}.
              </h2>
              <p>Here’s what’s happening in your payment workspace.</p>
            </div>
            <div className="date-label">
              <Activity size={15} /> Live workspace data
            </div>
          </div>
          {error && (
            <div className="alert error page-alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <div className="stat-grid">
            <Stat
              icon={<Wallet />}
              label="Total processed"
              value={money(total)}
              foot="Across latest 100 transactions"
              tone="violet"
            />
            <Stat
              icon={<CreditCard />}
              label="Transactions"
              value={payments.length.toLocaleString("en-IN")}
              foot={`${successCount} successful simulations`}
              tone="blue"
            />
            <Stat
              icon={<Building2 />}
              label="Active merchants"
              value={merchants.filter((m) => m.is_active).length}
              foot="Your registered businesses"
              tone="orange"
            />
            <Stat
              icon={<Clock3 />}
              label="Avg. backend time"
              value={`${avgTime.toFixed(2)} ms`}
              foot="Recorded payment processing time"
              tone="green"
            />
          </div>
          <DynamicQR merchants={merchants} token={token} />
          <StaticQR
            merchants={merchants}
            token={token}
            onPaymentComplete={(payment) => {
              setPayments((old) => [payment, ...old]);
              setToast("Static QR payment completed successfully.");
              load();
            }}
          />
          {lastTiming && (
            <section className="timing-banner">
              <div className="timing-icon">
                <Clock3 size={20} />
              </div>
              <div className="timing-copy">
                <strong>Last payment timing</strong>
                <span>Measured for your most recent payment request</span>
              </div>
              <div className="timing-values">
                <div>
                  <strong>{lastTiming.backend?.toFixed(2) ?? "—"} ms</strong>
                  <span>Backend processing</span>
                </div>
                <div>
                  <strong>{lastTiming.roundTrip.toFixed(2)} ms</strong>
                  <span>Browser round trip</span>
                </div>
                <div>
                  <strong>
                    {lastTiming.security == null
                      ? "Not integrated"
                      : `${lastTiming.security.toFixed(2)} ms`}
                  </strong>
                  <span>Security protocol</span>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setLastTiming(null)}>
                <X size={17} />
              </button>
            </section>
          )}
          <div className="section-heading">
            <div>
              <h3>Transactions</h3>
              <p>Your latest simulated payment activity</p>
            </div>
            <button className="text-btn" onClick={() => load()}>
              View latest <ArrowUpRight size={15} />
            </button>
          </div>
          <section className="table-card">
            <div className="table-toolbar">
              <div className="table-title">
                <span className="live-dot" /> Recent activity{" "}
                <span className="result-count">{payments.length} records</span>
              </div>
              <button
                className="icon-btn"
                onClick={() => load()}
                title="Refresh transactions"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <th>Backend time</th>
            <th>Security time</th>
            <th>Created</th>
            {loading ? (
              <div className="empty-state">
                <div className="spinner" />
                Loading workspace…
              </div>
            ) : payments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <CreditCard size={23} />
                </div>
                <strong>No transactions yet</strong>
                <span>Create a simulated payment to see it appear here.</span>
                <button
                  className="btn primary"
                  onClick={() => setModal("payment")}
                >
                  <Plus size={16} /> Create payment
                </button>
              </div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Payment</th>
                      <th>Merchant</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="payment-cell">
                            <span className="payment-icon">
                              <ArrowDownLeft size={16} />
                            </span>
                            <div>
                              <strong>{p.payment_reference}</strong>
                              <small>#{p.id}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {merchantNames[p.merchant_id] ||
                            `Merchant #${p.merchant_id}`}
                        </td>
                        <td className="amount-cell">
                          {money(p.amount_paise, p.currency)}
                        </td>
                        <td>
                          <span className={`status ${p.status}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>
                          {p.processing_time_ms == null
                            ? "—"
                            : `${p.processing_time_ms.toFixed(2)} ms`}
                        </td>
                        <td>
                          {p.security_time_ms == null
                            ? "Not recorded"
                            : `${p.security_time_ms.toFixed(4)} ms`}
                        </td>
                        <td className="date-cell">{dateTime(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="bottom-grid">
            <section className="info-card">
              <div className="info-heading">
                <span className="info-icon shield">
                  <ShieldCheck size={18} />
                </span>

                <div>
                  <h3>Security research layer</h3>
                  <p>Experimental SIS-motivated protocol</p>
                </div>

                <span className="tag pending">Experimental</span>
              </div>

              <p className="info-description">
                The experimental authentication and session-key negotiation
                protocol executes during payment processing. Its measured
                execution time is stored with each payment.
              </p>

              <div className="merchant-list">
                <div className="merchant-row">
                  <div>
                    <strong>Recorded measurements</strong>
                    <small>Payments with a security-time value</small>
                  </div>
                  <strong>
                    {payments.filter((p) => p.security_time_ms != null).length}/{" "}
                    {payments.length}
                  </strong>
                </div>

                <div className="merchant-row">
                  <div>
                    <strong>Average security execution</strong>
                    <small>Across recorded payments</small>
                  </div>
                  <strong>
                    {payments.some((p) => p.security_time_ms != null)
                      ? `${(
                          payments
                            .filter((p) => p.security_time_ms != null)
                            .reduce((sum, p) => sum + p.security_time_ms, 0) /
                          payments.filter((p) => p.security_time_ms != null)
                            .length
                        ).toFixed(4)} ms`
                      : "Not recorded"}
                  </strong>
                </div>

                <div className="merchant-row">
                  <div>
                    <strong>Latest security execution</strong>
                    <small>Most recent payment</small>
                  </div>
                  <strong>
                    {payments.find((p) => p.security_time_ms != null)
                      ? `${payments.find((p) => p.security_time_ms != null).security_time_ms.toFixed(4)} ms`
                      : "Not recorded"}
                  </strong>
                </div>
              </div>

              <div className="info-foot">
                <span>
                  <span className="mini-dot green" />
                  Measurement stored per payment
                </span>
                <span>Research prototype</span>
              </div>
            </section>
            <section className="info-card">
              <div className="info-heading">
                <span className="info-icon merchant">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3>Your merchants</h3>
                  <p>Manage your business profiles</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => {
                    setError("");
                    setModal("merchant");
                  }}
                >
                  Add new <Plus size={14} />
                </button>
              </div>
              {merchants.length ? (
                <div className="merchant-list">
                  {merchants.slice(0, 3).map((m) => (
                    <div className="merchant-row" key={m.id}>
                      <span className="merchant-avatar">
                        {initials(m.business_name)}
                      </span>
                      <div>
                        <strong>{m.business_name}</strong>
                        <small>{m.merchant_code}</small>
                      </div>
                      <span
                        className={`merchant-state ${m.is_active ? "on" : ""}`}
                      >
                        {m.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="merchant-empty">
                  No merchants added yet.{" "}
                  <button onClick={() => setModal("merchant")}>
                    Create your first merchant
                  </button>
                </div>
              )}
            </section>
          </div>
          <footer className="footer">
            <span>© 2026 PQPay · Academic prototype</span>
            <span>
              <span className="mini-dot green" /> API connected when data loads
            </span>
            <span>Simulated transactions only — no real funds move.</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {modal === "payment" ? "NEW TRANSACTION" : "MERCHANT SETUP"}
                </span>
                <h2>
                  {modal === "payment" ? "Create a payment" : "Add a merchant"}
                </h2>
              </div>
              <button className="icon-btn" onClick={() => setModal("")}>
                <X size={19} />
              </button>
            </div>
            {modal === "payment" ? (
              <form className="form-stack" onSubmit={createPayment}>
                <div className="alert info">
                  <Activity size={16} /> This creates a simulated successful
                  payment record. No real money is collected or transferred.
                </div>
                <label>
                  Merchant
                  <select
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                    required
                  >
                    <option value="">Choose a merchant</option>
                    {merchants
                      .filter((m) => m.is_active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.business_name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Amount (INR)
                  <div className="amount-input">
                    <span>₹</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => setModal("")}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy || !merchants.length}
                  >
                    {busy ? "Processing…" : "Run simulation"}{" "}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </form>
            ) : (
              <form className="form-stack" onSubmit={createMerchant}>
                <label>
                  Business name
                  <input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Acme Store"
                    minLength="2"
                    maxLength="150"
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn outline"
                    onClick={() => setModal("")}
                  >
                    Cancel
                  </button>
                  <button className="btn primary" disabled={busy}>
                    {busy ? "Creating…" : "Create merchant"}{" "}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <BadgeCheck size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, foot, tone }) {
  return (
    <section className="stat-card">
      <div className={`stat-icon ${tone}`}>
        {React.cloneElement(icon, { size: 19 })}
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
