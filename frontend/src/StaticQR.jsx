
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QrCode, Camera, CheckCircle2, Store, RefreshCw } from 'lucide-react';

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

const money = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format((paise || 0) / 100);

export default function StaticQR({ merchants, token, onPaymentComplete }) {
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [merchantCode, setMerchantCode] = useState('');
  const [merchant, setMerchant] = useState(null);
  const [amount, setAmount] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const scannerRef = useRef(null);

  const activeMerchants = merchants.filter(m => m.is_active);

  useEffect(() => {
    if (!selectedMerchant) {
      setQrImage('');
      return;
    }

    const selected = activeMerchants.find(
      m => String(m.id) === selectedMerchant
    );

    if (!selected) return;

    QRCode.toDataURL(selected.merchant_code, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'H',
    })
      .then(setQrImage)
      .catch(() => setError('Could not generate QR code.'));
  }, [selectedMerchant, merchants]);

  useEffect(() => {
    if (!scanning) return;

    const scanner = new Html5QrcodeScanner(
      'pqpay-qr-reader',
      { fps: 10, qrbox: { width: 230, height: 230 } },
      false
    );

    scannerRef.current = scanner;

    scanner.render(
      async decodedText => {
        try {
          await scanner.clear();
          setScanning(false);

          const code = decodedText.trim().replace(/^PQPay:/i, '');

          setError('');
          setPayment(null);
          setMerchant(null);
          setMerchantCode(code);

          const result = await apiRequest(
            `/payments/static/${encodeURIComponent(code)}`
          );

          setMerchant(result);
        } catch (err) {
          setError(err.message || 'Unable to identify this merchant.');
        }
      },
      () => {}
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scanning]);

  async function submitPayment(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setPayment(null);

    try {
      const amountPaise = Math.round(Number(amount) * 100);

      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
        throw new Error('Enter a valid payment amount.');
      }

      const result = await apiRequest(
        `/payments/static/${encodeURIComponent(merchantCode)}/pay`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            amount_paise: amountPaise,
            currency: 'INR',
          }),
        }
      );

      setPayment(result);
      setAmount('');
      onPaymentComplete?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resetScanner() {
    setMerchant(null);
    setMerchantCode('');
    setAmount('');
    setPayment(null);
    setError('');
    setScanning(false);
  }

  return (
    <section className="static-qr-grid">
      <div className="info-card static-qr-card">
        <div className="info-heading">
          <span className="info-icon merchant"><QrCode size={19} /></span>
          <div>
            <h3>Your permanent merchant QR</h3>
            <p>Customers scan this code and enter their amount</p>
          </div>
        </div>

        {activeMerchants.length === 0 ? (
          <p className="qr-empty">Create an active merchant first.</p>
        ) : (
          <>
            <label className="qr-label">
              Select merchant
              <select
                value={selectedMerchant}
                onChange={e => setSelectedMerchant(e.target.value)}
              >
                <option value="">Choose a merchant</option>
                {activeMerchants.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.business_name}
                  </option>
                ))}
              </select>
            </label>

            {qrImage && (
              <div className="qr-display">
                <img src={qrImage} alt="Permanent merchant QR code" />
                <strong>
                  {activeMerchants.find(m => String(m.id) === selectedMerchant)?.business_name}
                </strong>
                <span>
                  {activeMerchants.find(m => String(m.id) === selectedMerchant)?.merchant_code}
                </span>
                <small>Permanent static QR · INR</small>
              </div>
            )}
          </>
        )}
      </div>

      <div className="info-card static-qr-card">
        <div className="info-heading">
          <span className="info-icon shield"><Camera size={19} /></span>
          <div>
            <h3>Scan & pay</h3>
            <p>Scan a merchant's permanent QR code</p>
          </div>
        </div>

        {!merchant && !payment && (
          <>
            <p className="qr-description">
              Scan a PQPay merchant QR code to retrieve the verified business
              name and enter your payment amount.
            </p>

            {!scanning ? (
              <button
                className="btn primary"
                onClick={() => {
                  setError('');
                  setScanning(true);
                }}
              >
                <Camera size={16} /> Open camera scanner
              </button>
            ) : (
              <>
                <div id="pqpay-qr-reader" className="qr-reader" />
                <button
                  className="btn outline"
                  onClick={() => setScanning(false)}
                >
                  Cancel scanning
                </button>
              </>
            )}
          </>
        )}

        {merchant && !payment && (
          <form className="form-stack qr-pay-form" onSubmit={submitPayment}>
            <div className="verified-merchant">
              <Store size={20} />
              <div>
                <strong>{merchant.business_name}</strong>
                <small>Merchant verified by PQPay</small>
              </div>
              <CheckCircle2 size={19} />
            </div>

            <label>
              Amount (INR)
              <div className="amount-input">
                <span>₹</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>

            <button className="btn primary" disabled={busy}>
              {busy ? 'Processing payment…' : 'Confirm payment'}
            </button>

            <button type="button" className="btn outline" onClick={resetScanner}>
              Scan another QR
            </button>
          </form>
        )}

        {payment && (
          <div className="qr-success">
            <CheckCircle2 size={34} />
            <h3>Payment successful</h3>
            <strong>{money(payment.amount_paise)}</strong>
            <span>{merchant?.business_name}</span>
            <small>{payment.payment_reference}</small>
            <button className="btn outline" onClick={resetScanner}>
              <RefreshCw size={15} /> Make another payment
            </button>
          </div>
        )}

        {error && <div className="alert error qr-error">{error}</div>}
      </div>
    </section>
  );
}
