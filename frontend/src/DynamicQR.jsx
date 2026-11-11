
import React, { useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Clock3, Copy } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

export default function DynamicQR({ merchants, token }) {
  const [merchantId, setMerchantId] = useState('');
  const [amount, setAmount] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generateQR(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setRequest(null);
    setQrImage('');

    try {
      const response = await fetch(`${API}/payments/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant_id: Number(merchantId),
          amount_paise: Math.round(Number(amount) * 100),
          currency: 'INR',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || 'Could not create payment request.');
      }

      const paymentUrl =
        `${window.location.origin}/?payment_request=${encodeURIComponent(data.request_token)}`;

      const image = await QRCode.toDataURL(paymentUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'H',
      });

      setRequest(data);
      setQrImage(image);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!request) return;

    const url =
      `${window.location.origin}/?payment_request=${encodeURIComponent(request.request_token)}`;

    await navigator.clipboard.writeText(url);
  }

  const activeMerchants = merchants.filter(m => m.is_active);

  return (
    <section className="info-card dynamic-qr-card">
      <div className="info-heading">
        <span className="info-icon shield"><QrCode size={19}/></span>
        <div>
          <h3>Generate dynamic QR</h3>
          <p>Create a unique QR for each customer payment</p>
        </div>
      </div>

      {!request ? (
        <form className="form-stack dynamic-qr-form" onSubmit={generateQR}>
          <label>
            Merchant
            <select
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              required
            >
              <option value="">Choose a merchant</option>
              {activeMerchants.map(m => (
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
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </label>

          <button className="btn primary" disabled={busy || !activeMerchants.length}>
            {busy ? 'Generating…' : 'Generate dynamic QR'}
          </button>
        </form>
      ) : (
        <div className="qr-display">
          <img src={qrImage} alt="Dynamic payment QR code"/>
          <strong>{activeMerchants.find(m => String(m.id) === merchantId)?.business_name}</strong>
          <strong>{new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
          }).format(request.amount_paise / 100)}</strong>
          <span>Request: {request.request_token}</span>
          <small><Clock3 size={13}/> Expires: {new Date(request.expires_at).toLocaleTimeString('en-IN')}</small>

          <button className="btn outline" onClick={copyLink}>
            <Copy size={15}/> Copy payment link
          </button>

          <button className="btn outline" onClick={() => {
            setRequest(null);
            setQrImage('');
            setAmount('');
          }}>
            Generate another QR
          </button>
        </div>
      )}

      {error && <div className="alert error qr-error">{error}</div>}
    </section>
  );
}
