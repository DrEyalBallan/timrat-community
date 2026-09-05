'use client';

import React, { useState, useEffect, useRef } from 'react';
import { uploadMediaWithProgress } from '@/lib/clientUpload';
import { isMediaVideo } from '@/lib/mediaUtils';

interface MyUploadItem {
  url: string;
  token: string;
  fullName: string;
  greeting: string;
  time: number;
}

const USER_TOKEN_KEY = 'timrat_user_token';
const MY_UPLOADS_KEY = 'timrat_my_uploads';
const USER_FIRST_NAME_KEY = 'timrat_user_first_name';
const USER_LAST_NAME_KEY = 'timrat_user_last_name';

export default function UserGreetingPage() {
  const [userToken, setUserToken] = useState<string>('');
  const [myUploads, setMyUploads] = useState<MyUploadItem[]>([]);
  const [isMyUploadsOpen, setIsMyUploadsOpen] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [greeting, setGreeting] = useState('');
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploadedItem, setUploadedItem] = useState<MyUploadItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [isSearchingByName, setIsSearchingByName] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync user uploads with server using token, saved names, and local URLs
  const syncUserUploads = async (token: string, first?: string, last?: string, localList: MyUploadItem[] = []) => {
    try {
      const extraTokens = localList.map((i) => i.token).filter(Boolean);
      const uniqueTokens = Array.from(new Set([token, ...extraTokens].filter(Boolean))).join(',');
      const urls = localList.map((i) => i.url).filter(Boolean).join(',');

      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (uniqueTokens) params.set('tokens', uniqueTokens);
      if (first?.trim()) params.set('firstName', first.trim());
      if (last?.trim()) params.set('lastName', last.trim());
      if (urls) params.set('urls', urls);

      const res = await fetch(`/api/user/my-uploads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          const merged: MyUploadItem[] = data.items.map((srvItem: any) => {
            const localMatch = localList.find((l) => l.url === srvItem.url);
            return {
              url: srvItem.url,
              token: srvItem.token || localMatch?.token || token,
              fullName: srvItem.fullName || localMatch?.fullName || `${srvItem.firstName || ''} ${srvItem.lastName || ''}`.trim() || 'תושב/ת תמרת',
              greeting: srvItem.greeting || localMatch?.greeting || '',
              time: srvItem.time || localMatch?.time || Date.now(),
            };
          });

          setMyUploads(merged);
          try {
            localStorage.setItem(MY_UPLOADS_KEY, JSON.stringify(merged));
          } catch {}
          return merged;
        }
      }
    } catch (e) {
      console.warn('Could not sync user uploads:', e);
    }
    return localList;
  };

  // Initialize on mount
  useEffect(() => {
    // 1. Persistent Token
    let token = localStorage.getItem(USER_TOKEN_KEY);
    if (!token) {
      token = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(USER_TOKEN_KEY, token);
    }
    setUserToken(token);

    // 2. Pre-fill names
    const savedFirst = localStorage.getItem(USER_FIRST_NAME_KEY) || '';
    const savedLast = localStorage.getItem(USER_LAST_NAME_KEY) || '';
    if (savedFirst) setFirstName(savedFirst);
    if (savedLast) setLastName(savedLast);

    // 3. Load from localStorage
    let localItems: MyUploadItem[] = [];
    try {
      const raw = localStorage.getItem(MY_UPLOADS_KEY);
      if (raw) {
        localItems = JSON.parse(raw);
        if (Array.isArray(localItems)) {
          setMyUploads(localItems);
        }
      }
    } catch {}

    // 4. Server Sync
    syncUserUploads(token, savedFirst, savedLast, localItems);
  }, []);

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVid = isMediaVideo(file.name) || file.type.startsWith('video/');
    if (isVid) {
      setErrorMessage('⚠️ העלאת סרטוני וידאו מוגבלת למנהל המערכת בלבד. תושבים מוזמנים להעלות תמונת ברכה.');
      setSelectedFile(null);
      setFilePreview(null);
      if (e.target) e.target.value = '';
      return;
    }

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
      setErrorMessage('נא לבחור תמונת ברכה להעלאה');
      return;
    }
    if (isMediaVideo(selectedFile.name) || selectedFile.type?.startsWith('video/')) {
      setErrorMessage('⚠️ העלאת סרטוני וידאו מוגבלת למנהל המערכת בלבד. תושבים מוזמנים להעלות תמונת ברכה.');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setIsSuccess(false);
    setProgress(15);

    // Remember name in localStorage
    try {
      localStorage.setItem(USER_FIRST_NAME_KEY, cleanFirstName);
      localStorage.setItem(USER_LAST_NAME_KEY, cleanLastName);
    } catch {}

    const effectiveToken = userToken || ('usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10));
    if (!userToken) {
      setUserToken(effectiveToken);
      localStorage.setItem(USER_TOKEN_KEY, effectiveToken);
    }

    try {
      const data = await uploadMediaWithProgress({
        file: selectedFile,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        greeting: cleanGreeting,
        token: effectiveToken,
        onProgress: (pct) => setProgress(pct),
      });

      setProgress(100);

      const newItem: MyUploadItem = {
        url: data.url,
        token: data.token || effectiveToken,
        fullName: `${cleanFirstName} ${cleanLastName}`,
        greeting: cleanGreeting,
        time: Date.now(),
      };

      setUploadedItem(newItem);
      setIsSuccess(true);

      // Add to myUploads
      setMyUploads((prev) => {
        const updated = [newItem, ...prev.filter((i) => i.url !== newItem.url)];
        try {
          localStorage.setItem(MY_UPLOADS_KEY, JSON.stringify(updated));
        } catch {}
        return updated;
      });
    } catch (err: any) {
      const msg = err?.message || 'שגיאה בהעלאת הקובץ. אנא נסו שוב.';
      setErrorMessage(msg);
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete all uploads for this user
  const handleDeleteAllUploads = async () => {
    if (myUploads.length === 0) return;

    const count = myUploads.length;
    const confirmMessage = `האם אתם בטוחים שברצונכם למחוק את כל ${count} התמונות והברכות שהעליתם?\n\nהן יוסרו מיד מהגלריה ומההקרנה.`;
    if (!confirm(confirmMessage)) return;

    setIsDeleting(true);
    try {
      const allTokens = Array.from(new Set([userToken, ...myUploads.map((i) => i.token)].filter(Boolean)));
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: userToken,
          tokens: allTokens,
          urls: myUploads.map((i) => i.url),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          deleteAll: true,
        }),
      });

      if (res.ok) {
        setMyUploads([]);
        try {
          localStorage.removeItem(MY_UPLOADS_KEY);
        } catch {}
        setUploadedItem(null);
        setIsSuccess(false);
        setIsMyUploadsOpen(false);
        handleResetForNew();
        alert('כל התמונות והברכות שלך נמחקו בהצלחה מהמערכת.');
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'מחיקת התכנים נכשלה. אנא נסו שוב.');
      }
    } catch (e) {
      console.error('Delete all error:', e);
      alert('שגיאה במחיקת התכנים.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete a single upload
  const handleDeleteSingleUpload = async (item: MyUploadItem) => {
    if (!confirm('האם אתם בטוחים שברצונכם למחוק תמונה וברכה זו?')) return;

    setDeletingUrl(item.url);
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          token: item.token || userToken,
          tokens: [userToken, item.token].filter(Boolean),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });

      if (res.ok) {
        const nextUploads = myUploads.filter((i) => i.url !== item.url);
        setMyUploads(nextUploads);
        try {
          localStorage.setItem(MY_UPLOADS_KEY, JSON.stringify(nextUploads));
        } catch {}

        if (uploadedItem?.url === item.url) {
          setUploadedItem(null);
          if (nextUploads.length === 0) {
            handleResetForNew();
          }
        }
        alert('התמונה והברכה נמחקו בהצלחה.');
      } else {
        alert('מחיקת התמונה נכשלה. אנא נסו שוב.');
      }
    } catch (e) {
      console.error('Delete single error:', e);
      alert('שגיאה במחיקת התמונה.');
    } finally {
      setDeletingUrl(null);
    }
  };

  // Search and claim uploads by Name (useful if user refreshed or cleared cache)
  const handleFindUploadsByName = async () => {
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    if (!cleanFirst || !cleanLast) {
      alert('נא להזין שם פרטי ושם משפחה בטופס למציאת ההעלאות שלך.');
      return;
    }

    setIsSearchingByName(true);
    try {
      const found = await syncUserUploads(userToken, cleanFirst, cleanLast, myUploads);
      if (found && found.length > 0) {
        alert(`נמצאו ${found.length} תמונות תואמות לשם ${cleanFirst} ${cleanLast}! כעת תוכל/י לנהל ולמחוק אותן.`);
      } else {
        alert(`לא נמצאו תמונות פעילות במערכת תחת השם ${cleanFirst} ${cleanLast}.`);
      }
    } catch {
      alert('שגיאה בחיפוש תמונות.');
    } finally {
      setIsSearchingByName(false);
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

        {/* Top Action Bar */}
        <div className="user-top-actions">
          {myUploads.length > 0 && (
            <button
              type="button"
              className="my-uploads-trigger-btn"
              onClick={() => setIsMyUploadsOpen(true)}
              title="צפייה וניהול של כל התמונות שהעליתם"
            >
              <span>📸</span>
              <span>ההעלאות שלי</span>
              <span className="my-uploads-count-badge">{myUploads.length}</span>
            </button>
          )}

          <a
            href="/gallery"
            className="my-uploads-trigger-btn"
            style={{
              borderColor: 'rgba(74, 222, 128, 0.5)',
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.2)',
            }}
          >
            <span>📺</span>
            <span>מעבר לגלריה והקרנה</span>
          </a>
        </div>

        {/* ALWAYS-VISIBLE INLINE DELETE & UPLOADS PANEL (Active on Refresh and at all times) */}
        {myUploads.length > 0 && (
          <div className="my-active-uploads-panel animate-fade-in">
            <div className="my-active-uploads-header">
              <div className="my-active-uploads-title">
                <span>📸</span>
                <span>התמונות והברכות שהעלית ({myUploads.length})</span>
              </div>
              <button
                type="button"
                className="btn-delete-all-banner"
                onClick={handleDeleteAllUploads}
                disabled={isDeleting}
                title="מחיקת כל התמונות שהעלית בבת אחת"
              >
                <span>🗑️</span>
                <span>{isDeleting ? 'מוחק...' : 'מחק את כל ההעלאות שלי'}</span>
              </button>
            </div>

            <div className="my-active-uploads-grid">
              {myUploads.map((item) => (
                <div className="my-active-upload-card" key={item.url}>
                  {isMediaVideo(item.url) ? (
                    <video src={item.url} muted playsInline className="my-active-upload-img" />
                  ) : (
                    <img src={item.url} alt="התמונה שהעלית" className="my-active-upload-img" />
                  )}
                  <div className="my-active-upload-info">
                    <div className="my-active-upload-name">{item.fullName}</div>
                    <div className="my-active-upload-greeting" title={item.greeting}>
                      "{item.greeting}"
                    </div>
                  </div>
                  <button
                    type="button"
                    className="my-active-upload-del-btn"
                    onClick={() => handleDeleteSingleUpload(item)}
                    disabled={deletingUrl === item.url || isDeleting}
                    title="מחק תמונה זו"
                  >
                    {deletingUrl === item.url ? 'מוחק...' : '🗑️ מחק'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User instructions folder */}
        <div className="instruction-box">
          <span className="instruction-icon">📂</span>
          <div className="instruction-text">
            העלו תמונה וכתבו ברכה לשנה החדשה שקשורה לתמונה וסטודיו NUTZEK AI יצור לכם סרטונים
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

            {/* Find my uploads by name helper if user refreshed or on another device */}
            {myUploads.length === 0 && (firstName.trim() || lastName.trim()) && (
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={handleFindUploadsByName}
                  disabled={isSearchingByName}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4ade80',
                    fontSize: '0.85rem',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {isSearchingByName ? 'מחפש העלאות קודמות...' : '🔍 העליתם כבר תמונה? לחצו למציאת ההעלאות שלכם ומחיקתן'}
                </button>
              </div>
            )}

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

            {/* Native Label File Dropzone */}
            <label
              className="file-dropzone"
              style={{ cursor: 'pointer', display: 'block' }}
            >
              <input
                type="file"
                accept="image/*,.jpeg,.jpg,.png,.webp,.heic,.heif"
                style={{ display: 'none' }}
                disabled={isUploading}
                onChange={handleSelectFile}
              />
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
                    לחצו כאן לבחירת תמונת ברכה מהמכשיר
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                    תומך בכל סוגי התמונות (JPG, PNG, HEIC)
                  </div>
                </div>
              )}
            </label>

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
                    <span>מעלה לענן... {progress > 0 && `${Math.round(progress)}%`}</span>
                  </div>
                  {progress > 0 && (
                    <div className="progress-bar-wrap">
                      <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              ) : (
                '🌿 שליחת הברכה והקובץ ללוח היישוב'
              )}
            </button>
          </form>
        ) : (
          /* Success Screen with Postcard Preview */
          <div className="animate-fade-in">
            <div className="success-banner">
              <div className="success-badge-icon">🍯🍎</div>
              <h2 className="success-title">הברכה נקלטה בהצלחה!</h2>
              <p className="success-sub">
                האיחול שלכם שודר ונוסף למסך ההקרנה וגלריית הברכות של תמרת.
              </p>

              {/* Postcard preview */}
              {uploadedItem && (
                <div className="postcard-box">
                  {isMediaVideo(uploadedItem.url) ? (
                    <video
                      src={uploadedItem.url}
                      controls
                      autoPlay
                      muted
                      playsInline
                      className="postcard-img"
                      style={{ maxHeight: '280px', width: '100%', objectFit: 'contain', background: '#000' }}
                    />
                  ) : (
                    <img
                      src={uploadedItem.url}
                      alt="הקובץ שהועלה"
                      className="postcard-img"
                    />
                  )}
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
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetForNew}
              >
                ➕ העלאת תמונה וברכה נוספת
              </button>

              <a
                href="/gallery"
                className="btn-primary"
                style={{ textAlign: 'center', textDecoration: 'none', padding: '0.95rem' }}
              >
                🖼️ מעבר לצפייה בגלריית הברכות וההקרנה
              </a>

              {/* Single Delete of Current Upload */}
              {uploadedItem && (
                <button
                  type="button"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleDeleteSingleUpload(uploadedItem)}
                  disabled={deletingUrl === uploadedItem.url}
                >
                  {deletingUrl === uploadedItem.url ? 'מוחק...' : '🗑️ מחק תמונה זו בלבד'}
                </button>
              )}

              {/* Bulk Delete All My Uploads */}
              {myUploads.length > 1 && (
                <button
                  type="button"
                  style={{
                    background: 'rgba(239, 68, 68, 0.22)',
                    color: '#fca5a5',
                    border: '1.5px solid #ef4444',
                    borderRadius: '12px',
                    padding: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                  onClick={handleDeleteAllUploads}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'מוחק את כל ההעלאות...' : `🗑️ מחק את כל ${myUploads.length} ההעלאות שלי`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer Navigation & Nutzek Credits */}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}
        >
          <a
            href="/gallery"
            style={{
              color: '#4ade80',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '12px',
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1.5px solid rgba(74, 222, 128, 0.4)',
              boxShadow: '0 3px 10px rgba(34, 197, 94, 0.15)',
            }}
          >
            <span>📺</span>
            <span>למעבר לגלריית הצפייה ומסך ההקרנה בלייב</span>
          </a>

          {/* Nutzek Logo & Link with Blinking Invitation Arrows */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
              paddingTop: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', letterSpacing: '0.5px' }}>
              בשיתוף והפקת
            </span>
            <a
              href="https://www.nutzek.com/nfc"
              target="_blank"
              rel="noopener noreferrer"
              title="מעבר לאתר NUTZEK – לחצו כאן"
              className="nutzek-banner-link"
            >
              <span className="nutzek-arrow-r" aria-hidden="true">👈</span>
              <img
                src="/nutzek-logo.png"
                alt="NUTZEK Productions"
                className="nutzek-logo-img"
              />
              <span className="nutzek-arrow-l" aria-hidden="true">👉</span>
            </a>
            <span style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 600, opacity: 0.9 }}>
              ✨ לחצו לפרטים נוספים ✨
            </span>
          </div>
        </div>
      </div>

      {/* "My Uploads" Full Management Modal */}
      {isMyUploadsOpen && (
        <div
          className="my-uploads-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMyUploadsOpen(false);
          }}
        >
          <div className="my-uploads-modal-card">
            <div className="my-uploads-header">
              <div className="my-uploads-title">
                <span>📸</span>
                <span>ההעלאות שלי</span>
                <span className="my-uploads-count-badge">{myUploads.length}</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsMyUploadsOpen(false)}
                title="סגירה"
              >
                ✕
              </button>
            </div>

            <div className="my-uploads-body">
              {myUploads.length === 0 ? (
                <div className="my-uploads-empty">
                  <div className="my-uploads-empty-icon">📭</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                    לא נמצאו העלאות פעילות
                  </div>
                  <div style={{ fontSize: '0.9rem', maxWidth: '300px' }}>
                    הזינו את שמכם בטופס או העלו תמונה חדשה, והיא תופיע כאן עם אפשרות מחיקה.
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', fontSize: '0.95rem' }}
                    onClick={() => setIsMyUploadsOpen(false)}
                  >
                    חזרה לטופס
                  </button>
                </div>
              ) : (
                <>
                  <div className="delete-all-banner">
                    <button
                      type="button"
                      className="btn-delete-all"
                      onClick={handleDeleteAllUploads}
                      disabled={isDeleting}
                    >
                      <span>🗑️</span>
                      <span>
                        {isDeleting
                          ? 'מוחק את כל ההעלאות...'
                          : `מחק את כל ההעלאות שלי (${myUploads.length} תמונות)`}
                      </span>
                    </button>
                    <div className="delete-all-banner-text">
                      ⚠️ לחיצה על כפתור זה תמחק לצמיתות את כל התמונות והברכות שהעליתם, והן יוסרו מיד מהגלריה ומההקרנה.
                    </div>
                  </div>

                  <div className="my-uploads-list">
                    {myUploads.map((item) => (
                      <div className="my-upload-card" key={item.url}>
                        {isMediaVideo(item.url) ? (
                          <video src={item.url} muted playsInline className="my-upload-thumb" />
                        ) : (
                          <img src={item.url} alt="העלאה שלי" className="my-upload-thumb" />
                        )}
                        <div className="my-upload-details">
                          <div className="my-upload-name">{item.fullName}</div>
                          <div className="my-upload-greeting" title={item.greeting}>
                            "{item.greeting}"
                          </div>
                          <div className="my-upload-time">
                            {new Date(item.time).toLocaleDateString('he-IL', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: 'numeric',
                              month: 'numeric',
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="my-upload-delete-btn"
                          onClick={() => handleDeleteSingleUpload(item)}
                          disabled={deletingUrl === item.url || isDeleting}
                          title="מחק תמונה זו"
                        >
                          {deletingUrl === item.url ? 'מוחק...' : '🗑️ מחק'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
