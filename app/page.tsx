'use client';

import React, { useState, useRef } from 'react';

export default function UserGreetingPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploadedItem, setUploadedItem] = useState<{
    url: string;
    token: string;
    fullName: string;
    greeting: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMessage('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanGreeting = greeting.trim();

    if (!cleanFirstName) {
      setErrorMessage('נא להזין שם פרטי');
      return;
    }
    if (!cleanLastName) {
      setErrorMessage('נא להזין שם משפחה');
      return;
    }
    if (!cleanGreeting) {
      setErrorMessage('נא לכתוב ברכה לשנה החדשה שקשורה לתמונה');
      return;
    }
    if (!selectedFile) {
      setErrorMessage('נא לבחור תמונה להעלאה');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setIsSuccess(false);
    setProgress(15);

    const clientToken = Math.random().toString(36).slice(2, 12);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('firstName', cleanFirstName);
    formData.append('lastName', cleanLastName);
    formData.append('greeting', cleanGreeting);
    formData.append('token', clientToken);

    // Smooth progress simulation
    const progressTimer = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + Math.floor(Math.random() * 15 + 5) : prev));
    }, 200);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressTimer);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'ההעלאה נכשלה. אנא נסו שוב.');
      }

      const data = await response.json();
      setProgress(100);
      setUploadedItem({
        url: data.url,
        token: data.token || clientToken,
        fullName: `${cleanFirstName} ${cleanLastName}`,
        greeting: cleanGreeting,
      });
      setIsSuccess(true);
    } catch (err: any) {
      clearInterval(progressTimer);
      const msg = err?.message || 'שגיאה בהעלאת התמונה. אנא נסו שוב.';
      setErrorMessage(msg);
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteOwnUpload = async () => {
    if (!uploadedItem) return;
    if (!confirm('האם אתם בטוחים שברצונכם למחוק את התמונה והברכה שהעליתם?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: uploadedItem.url, token: uploadedItem.token }),
      });

      if (res.ok) {
        setIsSuccess(false);
        setUploadedItem(null);
        handleResetForNew();
        alert('התוכן נמחק בהצלחה.');
      } else {
        alert('מחיקת התוכן נכשלה. אנא פנו למנהל המערכת.');
      }
    } catch (e) {
      console.error(e);
      alert('שגיאה במחיקת התוכן.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetForNew = () => {
    setIsSuccess(false);
    setUploadedItem(null);
    setGreeting('');
    setSelectedFile(null);
    setFilePreview(null);
    setProgress(0);
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <main className="upload-page">
      <div className="upload-card animate-fade-in" dir="rtl">
        {/* Timrat Logo */}
        <div className="timrat-logo-wrapper">
          <img
            src="/logo.jpeg"
            alt="לוגו תמרת - יישוב קהילתי כפרי"
            className="timrat-logo"
          />
        </div>

        <h1 className="main-title">ברכות לשנה החדשה</h1>
        <p className="sub-title">קהילת תמרת – יישוב קהילתי כפרי</p>

        {/* User instructions folder */}
        <div className="instruction-box">
          <span className="instruction-icon">📂</span>
          <div className="instruction-text">
            העלו תמונה וכתבו ברכה לשנה החדשה שקשורה לתמונה
          </div>
        </div>

        {!isSuccess ? (
          <form onSubmit={handleFormSubmit}>
            {/* First Name & Last Name */}
            <div className="name-grid">
              <div className="input-group">
                <label htmlFor="first-name" className="input-label">
                  <span>👤</span> שם פרטי
                </label>
                <input
                  id="first-name"
                  type="text"
                  className="modern-input"
                  placeholder="לדוגמה: דנה"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isUploading}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="last-name" className="input-label">
                  <span>🏡</span> שם משפחה
                </label>
                <input
                  id="last-name"
                  type="text"
                  className="modern-input"
                  placeholder="לדוגמה: לוי / משפחת לוי"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isUploading}
                  required
                />
              </div>
            </div>

            {/* Greeting textarea */}
            <div className="input-group">
              <label htmlFor="greeting-input" className="input-label">
                <span>🍎</span> ברכה לשנה החדשה (שקשורה לתמונה)
              </label>
              <textarea
                id="greeting-input"
                className="modern-input"
                placeholder="כתבו כאן את הברכה והאיחולים שלכם לקראת השנה החדשה..."
                rows={3}
                maxLength={300}
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                disabled={isUploading}
                required
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', textAlign: 'left' }}>
                {greeting.length}/300 תווים
              </span>
            </div>

            {/* File Dropzone & Selector */}
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleSelectFile}
            />

            <div
              className="file-dropzone"
              onClick={() => fileInputRef.current?.click()}
            >
              {filePreview ? (
                <div className="preview-container">
                  <img src={filePreview} alt="תצוגה מקדימה" className="preview-img" />
                  <div className="preview-badge">
                    📷 נבחרה תמונה: {selectedFile?.name} (לחצו להחלפה)
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1.25rem 0' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#4ade80' }}>
                    לחצו כאן לבחירת תמונה מהמכשיר או צילום במצלמה
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    תומך בכל סוגי התמונות (JPG, PNG, HEIC, ועוד)
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1.5px solid #ef4444',
                  color: '#fca5a5',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  marginBottom: '1.25rem',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-primary huge-btn"
              disabled={isUploading}
            >
              {isUploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="loader" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    <span>מעלה את הברכה והתמונה... {progress > 0 && `${Math.round(progress)}%`}</span>
                  </div>
                  {progress > 0 && (
                    <div className="progress-bar-wrap">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              ) : (
                '🌿 שליחת הברכה והתמונה ללוח היישוב'
              )}
            </button>
          </form>
        ) : (
          /* Success Screen with Postcard Preview */
          <div className="animate-fade-in">
            <div className="success-banner">
              <div className="success-badge-icon">🍯🍎</div>
              <h2 className="success-title">הברכה והתמונה התקבלו בהצלחה!</h2>
              <p className="success-sub">
                האיחול שלכם שודר ונוסף למסך ההקרנה וגלריית הברכות של תמרת.
              </p>

              {/* Postcard preview */}
              {uploadedItem && (
                <div className="postcard-box">
                  <img
                    src={uploadedItem.url}
                    alt="התמונה שהועלתה"
                    className="postcard-img"
                  />
                  <div className="postcard-content">
                    <div className="postcard-greeting">
                      "{uploadedItem.greeting}"
                    </div>
                    <div className="postcard-author">
                      <span>✍️</span>
                      <span>בברכה: {uploadedItem.fullName}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <a
                href="/gallery"
                className="btn-primary"
                style={{ textAlign: 'center', textDecoration: 'none', padding: '0.95rem' }}
              >
                🖼️ מעבר לצפייה בגלריית הברכות וההקרנה
              </a>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetForNew}
              >
                ➕ העלאת תמונה וברכה נוספת
              </button>

              <button
                type="button"
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                onClick={handleDeleteOwnUpload}
                disabled={isDeleting}
              >
                {isDeleting ? 'מוחק...' : '🗑️ ביטול ומחיקת התוכן שהעליתי'}
              </button>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
            color: '#94a3b8',
          }}
        >
          <a
            href="/gallery"
            style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 700 }}
          >
            📺 גלריית צפייה והקרנה בלייב
          </a>
          <a
            href="/admin"
            style={{ color: '#94a3b8', textDecoration: 'none' }}
          >
            🔒 ניהול אדמין
          </a>
        </div>
      </div>
    </main>
  );
}
