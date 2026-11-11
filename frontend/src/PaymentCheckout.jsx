
import React, { useEffect, useState } from 'react';
import { Wallet, ShieldCheck, CheckCircle2, Clock3, ArrowLeft } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

async function apiRequest(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.detail || `Request failed (${response.status})`);
  }

  return data;
}

const money = (paise, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format((paise || 0) / 100);

export default function PaymentCheckout({ token, requestToken }) {
  const [details, setDetails] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadRequest() {
      try {
        const result = await apiRequest(
          `/payments/requests/${encodeURIComponent(requestToken)}`
        );

        if (!cancelled) setDetails(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRequest();

    return () => {
      cancelled = true;
    };
  }, [requestToken]);

  async function confirmPayment() {
    setBusy(true);
    setError('');

    try {
      const result = await apiRequest(
        `/payments/requests/${encodeURIComponent(requestToken)}/confirm`,
        {
          token,
          method: 'POST',
        }
      );

      setPayment(result);
      setDetails(old => ({ ...old, status: 'paid' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="checkout-shell">
      <div className="checkout-card">Loading payment details…</div>
    </main>;
  }

  if (!details) {
    return <main className="checkout-shell">
      <div className="checkout-card">
        <Wallet size={30} />
        <h2>Payment request unavailable</h2>
        <p>{error || 'This payment request could not be found.'}</p>
        <button className="btn outline" onClick={() => window.location.assign('/')}>
          <ArrowLeft size={15} /> Go to PQPay
        </button>
      </div>
    </main>;
  }

  return (
    <main className="checkout-shell">
      <section className="checkout-card">
        <div className="checkout-brand">
          <span className="brand-mark"><Wallet size={20}/></span>
          <strong>PQPay</strong>
        </div>

        {!payment ? (
          <>
            <span className="eyebrow">PAYMENT REQUEST</span>
            <h2>Confirm your payment</h2>

            <div className="checkout-merchant">
              <span>Paying to</span>
              <strong>{details.merchant_name}</strong>
            </div>

            <div className="checkout-amount">
              <span>Amount</span>
              <strong>{money(details.amount_paise, details.currency)}</strong>
            </div>

            <div className="checkout-expiry">
              <Clock3 size={15}/>
              Expires: {new Date(details.expires_at).toLocaleString('en-IN')}
            </div>

            {details.status === 'expired' ? (
              <div className="alert error">This payment request has expired.</div>
            ) : details.status !== 'pending' ? (
              <div className="alert info">
                This payment request is no longer available. Status: {details.status}.
              </div>
            ) : (
              <>
                <div className="checkout-security">
                  <ShieldCheck size={19}/>
                  <span>Experimental PQPay security protocol will run when you confirm.</span>
                </div>

                <button
                  className="btn primary full"
                  onClick={confirmPayment}
                  disabled={busy}
                >
                  {busy ? 'Processing payment…' : `Confirm and pay ${money(details.amount_paise, details.currency)}`}
                </button>
              </>
            )}
          </>
        ) : (
          <div className="checkout-success">
            <CheckCircle2 size={48}/>
            <h2>Payment successful!</h2>
            <strong>{money(payment.amount_paise, payment.currency)}</strong>
            <span>Paid to {details.merchant_name}</span>
            <small>Reference: {payment.payment_reference}</small>
            <small>Security time: {payment.security_time_ms?.toFixed(3)} ms</small>
          </div>
        )}

        {error && <div className="alert error checkout-error">{error}</div>}

        <button
          className="btn outline full checkout-back"
          onClick={() => window.location.assign('/')}
        >
          <ArrowLeft size={15}/> Go to PQPay dashboard
        </button>

        <p className="checkout-disclaimer">
          Academic simulation only. No real bank funds are transferred.
        </p>
      </section>
    </main>
  );
}
