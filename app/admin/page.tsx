'use client';

import React, { useState, useEffect, useRef } from 'react';

interface ImageItem {
  id: string;
  url: string;
  firstName: string;
  lastName: string;
  fullName: string;
  greeting: string;
  time: number;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingUrls, setDeletingUrls] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [searchFilter, setSearchFilter] = useState('');
  const [adminViewMode, setAdminViewMode] = useState<'cards' | 'mosaic'>('cards');
  const [activeModalItem, setActiveModalItem] = useState<ImageItem | null>(null);
  const [slideSeconds, setSlideSeconds] = useState(6);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [savedSettingsMsg, setSavedSettingsMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.slideDuration) setSlideSeconds(data.slideDuration);
      })
      .catch(() => {});
  }, []);

  const handleSlideSecondsChange = (newSec: number) => {
    setSlideSeconds(newSec);
    setSavedSettingsMsg('שומר...');
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(async () => {
      try {
        setIsSavingSettings(true);
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slideDuration: newSec, password }),
        });
        if (res.ok) {
          setSavedSettingsMsg('✅ נשמר');
          setTimeout(() => setSavedSettingsMsg(''), 2500);
        } else {
          setSavedSettingsMsg('⚠️ שגיאה');
        }
      } catch {
        setSavedSettingsMsg('⚠️ שגיאה');
      } finally {
        setIsSavingSettings(false);
      }
    }, 400);
  };

  useEffect(() => {
    const savedPass = sessionStorage.getItem('timrat_admin_pass');
    if (savedPass) {
      setPassword(savedPass);
      setIsAuthenticated(true);
      fetchImages(savedPass);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !password || isReorderMode) return;
    const interval = setInterval(() => {
      fetchImages(password, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, password, isReorderMode]);

  const fetchImages = async (pass: string, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/images', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setImages(data.images || []);
      }
    } catch (err) {
      console.error('Failed to fetch images', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsAuthenticated(true);
    sessionStorage.setItem('timrat_admin_pass', password);
    fetchImages(password);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('timrat_admin_pass');
    setPassword('');
    setIsAuthenticated(false);
    setImages([]);
    setSelectedUrls(new Set());
  };

  const toggleSelectUrl = (url: string) => {
    if (isReorderMode) return;
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedUrls.size === images.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(images.map((img) => img.url)));
    }
  };

  const handleDeleteSingle = async (url: string) => {
    if (!confirm('האם אתם בטוחים שברצונכם למחוק לצמיתות פריט זה?')) return;

    setDeletingUrls((prev) => new Set(prev).add(url));
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url], password }),
      });

      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.url !== url));
        setSelectedUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
        if (activeModalItem?.url === url) setActiveModalItem(null);
      } else if (res.status === 401) {
        alert('אין הרשאה! סיסמת מנהל שגויה.');
        handleLogout();
      } else {
        const data = await res.json();
        alert('שגיאה במחיקה: ' + (data.error || 'שגיאה לא ידועה'));
      }
    } catch (err) {
      console.error('Delete error', err);
      alert('שגיאה במחיקת הפריט.');
    } finally {
      setDeletingUrls((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedUrls.size === 0) return;
    if (!confirm(`האם אתם בטוחים שברצונכם למחוק לצמיתות את ${selectedUrls.size} הפריטים שנבחרו?`)) return;

    setIsBulkDeleting(true);
    const targetUrls = Array.from(selectedUrls);

    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: targetUrls, password }),
      });

      if (res.ok) {
        setImages((prev) => prev.filter((img) => !targetUrls.includes(img.url)));
        setSelectedUrls(new Set());
      } else if (res.status === 401) {
        alert('אין הרשאה! סיסמה שגויה.');
        handleLogout();
      } else {
        const data = await res.json();
        alert('שגיאה במחיקה: ' + (data.error || 'שגיאה לא ידועה'));
      }
    } catch (err) {
      console.error('Delete selected error', err);
      alert('שגיאה במחיקת הפריטים הנבחרים.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsBulkUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('firstName', 'צוות');
        formData.append('lastName', 'תמרת');
        formData.append('greeting', 'שנה טובה ומבורכת מקהילת תמרת!');

        await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        setUploadProgress({ current: i + 1, total: files.length });
      } catch (err) {
        console.error('Failed to upload file:', file.name, err);
      }
    }

    setIsBulkUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fetchImages(password);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...images];
    if (direction === 'up' && index > 0) {
      const temp = newItems[index - 1];
      newItems[index - 1] = newItems[index];
      newItems[index] = temp;
    } else if (direction === 'down' && index < newItems.length - 1) {
      const temp = newItems[index + 1];
      newItems[index + 1] = newItems[index];
      newItems[index] = temp;
    }
    setImages(newItems);
  };

  const moveToExtreme = (index: number, position: 'top' | 'bottom') => {
    const newItems = [...images];
    const [removed] = newItems.splice(index, 1);
    if (position === 'top') {
      newItems.unshift(removed);
    } else {
      newItems.push(removed);
    }
    setImages(newItems);
  };

  const jumpToPosition = (index: number) => {
    const target = prompt(`העבר פריט ממיקום ${index + 1} אל (1 - ${images.length}):`);
    if (!target) return;
    const pos = parseInt(target, 10);
    if (isNaN(pos) || pos < 1 || pos > images.length) {
      alert('מספר מיקום לא חוקי.');
      return;
    }
    const newItems = [...images];
    const [removed] = newItems.splice(index, 1);
    newItems.splice(pos - 1, 0, removed);
    setImages(newItems);
  };

  const handleSaveOrder = async () => {
    setIsSavingOrder(true);
    const orderUrls = images.map((img) => img.url);
    try {
      const res = await fetch('/api/admin/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderUrls, password }),
      });

      if (res.ok) {
        setIsReorderMode(false);
        alert('סדר הפריטים נשמר בהצלחה בשרת!');
      } else {
        const data = await res.json();
        alert('שגיאה בשמירת הסדר: ' + (data.error || 'שגיאה לא ידועה'));
      }
    } catch (err) {
      console.error('Save order error', err);
      alert('שגיאה בשמירת הסדר.');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const filteredImages = images.filter((img) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      img.fullName?.toLowerCase().includes(q) ||
      img.greeting?.toLowerCase().includes(q)
    );
  });

  if (!isAuthenticated) {
    return (
      <div className="upload-page">
        <div className="upload-card animate-fade-in" style={{ maxWidth: '440px' }} dir="rtl">
          <div className="timrat-logo-wrapper">
            <img src="/logo.jpeg" alt="תמרת" className="timrat-logo" />
          </div>
          <h1 className="main-title" style={{ fontSize: '1.8rem' }}>
            כניסת מנהל מערכת
          </h1>
          <p className="sub-title">ניהול גלריית ברכות תמרת לשנה החדשה</p>

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">סיסמת מנהל:</label>
              <input
                type="password"
                placeholder="הזינו סיסמת ניהול (ברירת מחדל: timrat2025)"
                className="modern-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn-primary huge-btn" style={{ marginTop: '0.5rem' }}>
              🔑 התחבר למערכת
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="/" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: 600, fontSize: '0.95rem' }}>
              ← חזרה לעמוד התושב
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page" dir="rtl">
      {/* Top Header Bar */}
      <div className="admin-header-bar">
        <div className="admin-title-area">
          <img src="/logo.jpeg" alt="תמרת" className="admin-logo" />
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
              פאנל ניהול קהילת תמרת
            </h1>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '4px' }}>
              <span className="admin-stat-badge">
                🍯 סה״כ ברכות: {images.length}
              </span>
              {selectedUrls.size > 0 && (
                <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700 }}>
                  {selectedUrls.size} נבחרו
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="admin-tools">
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleBulkUpload}
          />

          <a
            href="/gallery"
            className="btn-primary"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              textDecoration: 'none',
              fontSize: '1rem',
              background: 'linear-gradient(135deg, #15803d, #14532d)',
              boxShadow: '0 4px 12px rgba(21, 128, 61, 0.3)',
            }}
          >
            📽️ פתח מסך הקרנה מלא
          </a>

          {/* Slide Duration Slider Control */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              padding: '6px 12px',
              borderRadius: '10px',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', whiteSpace: 'nowrap' }}>
              ⏱️ זמן תצוגה להקרנה: <strong style={{ color: '#15803d' }}>{slideSeconds} שנ'</strong>
            </span>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={slideSeconds}
              onChange={(e) => handleSlideSecondsChange(parseInt(e.target.value, 10))}
              style={{ accentColor: '#15803d', cursor: 'pointer', width: '90px' }}
              title="שינוי זמן תצוגת כל שקופית בהקרנה"
            />
            {savedSettingsMsg && (
              <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {savedSettingsMsg}
              </span>
            )}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
            disabled={isBulkUploading}
          >
            {isBulkUploading ? `מעלה ${uploadProgress.current}/${uploadProgress.total}...` : '📤 העלאה מרוכזת'}
          </button>

          {isReorderMode ? (
            <button
              onClick={handleSaveOrder}
              className="btn-primary"
              disabled={isSavingOrder}
              style={{ background: '#16a34a', padding: '9px 18px', borderRadius: '10px' }}
            >
              {isSavingOrder ? 'שומר...' : '💾 שמירת סדר חדש'}
            </button>
          ) : (
            <button
              onClick={() => setIsReorderMode(true)}
              className="btn-secondary"
            >
              🔄 מצב סידור מחדש
            </button>
          )}

          <a
            href="/"
            className="btn-secondary"
            target="_blank"
            rel="noreferrer"
          >
            ✍️ עמוד תושב
          </a>

          <button
            onClick={handleLogout}
            className="btn-secondary"
            style={{ color: '#ef4444' }}
          >
            יציאה
          </button>
        </div>
      </div>

      {/* Filter, View Toggle & Batch Actions Bar */}
      <div
        style={{
          background: '#ffffff',
          padding: '1rem 1.5rem',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            className="modern-input"
            placeholder="🔍 חיפוש וסינון לפי שם תושב או תוכן ברכה..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ padding: '0.6rem 1rem' }}
          />

          {/* View mode toggle inside Admin */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px' }}>
            <button
              onClick={() => setAdminViewMode('cards')}
              style={{
                border: 'none',
                background: adminViewMode === 'cards' ? '#fff' : 'transparent',
                color: adminViewMode === 'cards' ? '#0f172a' : '#64748b',
                padding: '6px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: adminViewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              🗂️ כרטיסי ניהול
            </button>
            <button
              onClick={() => setAdminViewMode('mosaic')}
              style={{
                border: 'none',
                background: adminViewMode === 'mosaic' ? '#fff' : 'transparent',
                color: adminViewMode === 'mosaic' ? '#0f172a' : '#64748b',
                padding: '6px 12px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: adminViewMode === 'mosaic' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              🖼️ לוח קהילתי
            </button>
          </div>
        </div>

        {!isReorderMode && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="btn-secondary"
              onClick={handleSelectAll}
              style={{ padding: '6px 12px', fontSize: '0.9rem' }}
            >
              {selectedUrls.size === images.length ? 'בטל בחירת הכל' : 'בחר הכל'}
            </button>

            {selectedUrls.size > 0 && (
              <button
                className="admin-delete-btn"
                style={{ width: 'auto', padding: '6px 16px' }}
                onClick={handleDeleteSelected}
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? 'מוחק...' : `🗑️ מחק ${selectedUrls.size} נבחרים`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid of Items */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <span className="loader" style={{ width: '40px', height: '40px' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>טוען תמונות וברכות...</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: '#fff', borderRadius: '16px' }}>
          <p style={{ fontSize: '1.2rem', color: '#64748b' }}>לא נמצאו פריטים להצגה.</p>
        </div>
      ) : adminViewMode === 'mosaic' && !isReorderMode ? (
        /* Community Mosaic Grid inside Admin */
        <div className="community-grid">
          {filteredImages.map((item) => (
            <div
              key={item.url}
              className="grid-card"
              onClick={() => setActiveModalItem(item)}
              style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', color: '#0f172a' }}
            >
              <div className="grid-card-media">
                <img src={item.url} alt={item.greeting} className="grid-card-img" loading="lazy" />
              </div>
              <div className="grid-card-body">
                <div className="grid-card-greeting" style={{ color: '#0f172a' }}>
                  "{item.greeting}"
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="grid-card-author" style={{ color: '#15803d' }}>
                    <span>✍️</span>
                    <span>{item.fullName}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSingle(item.url);
                    }}
                    style={{
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    מחק
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Detailed Management Cards */
        <div className="admin-grid">
          {filteredImages.map((item, index) => {
            const isSelected = selectedUrls.has(item.url);
            const isVideo = item.url.match(/\.(mp4|webm|ogg|mov)$/i);

            return (
              <div
                key={item.url}
                className={`admin-card ${isSelected ? 'selected' : ''} ${isReorderMode ? 'reordering' : ''}`}
                draggable={isReorderMode}
                onDragStart={(e) => {
                  if (isReorderMode) {
                    setDraggedIndex(index);
                    e.dataTransfer.effectAllowed = 'move';
                  }
                }}
                onDragOver={(e) => {
                  if (isReorderMode) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  if (!isReorderMode || draggedIndex === null || draggedIndex === index) return;
                  e.preventDefault();
                  const newItems = [...images];
                  const [removed] = newItems.splice(draggedIndex, 1);
                  newItems.splice(index, 0, removed);
                  setImages(newItems);
                  setDraggedIndex(null);
                }}
              >
                {/* Selection Checkbox */}
                {!isReorderMode && (
                  <input
                    type="checkbox"
                    className="admin-card-checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectUrl(item.url)}
                  />
                )}

                {/* Index badge in reorder mode */}
                {isReorderMode && (
                  <div className="admin-card-badge-num">
                    #{index + 1}
                  </div>
                )}

                {/* Media preview (click opens modal) */}
                <div
                  className="admin-card-img-wrap"
                  onClick={() => !isReorderMode && setActiveModalItem(item)}
                  style={{ cursor: isReorderMode ? 'grab' : 'pointer' }}
                  title="לחצו להגדלה"
                >
                  {isVideo ? (
                    <video src={item.url} muted className="admin-card-img" />
                  ) : (
                    <img src={item.url} alt={item.greeting} className="admin-card-img" loading="lazy" />
                  )}
                </div>

                {/* Info & greeting */}
                <div className="admin-card-info">
                  <div>
                    <div className="admin-card-author">
                      ✍️ {item.fullName || 'ללא שם'}
                    </div>
                    <div className="admin-card-greeting">
                      "{item.greeting || 'ללא ברכה'}"
                    </div>
                    <div className="admin-card-time">
                      📅 {new Date(item.time).toLocaleString('he-IL')}
                    </div>
                  </div>

                  {/* Reorder controls or Delete button */}
                  {isReorderMode ? (
                    <div>
                      <div className="admin-reorder-btns">
                        <button
                          className="admin-reorder-btn"
                          onClick={() => moveItem(index, 'up')}
                          disabled={index === 0}
                          title="הזז למעלה"
                        >
                          ⬆️ למעלה
                        </button>
                        <button
                          className="admin-reorder-btn"
                          onClick={() => moveItem(index, 'down')}
                          disabled={index === images.length - 1}
                          title="הזז למטה"
                        >
                          ⬇️ למטה
                        </button>
                      </div>
                      <div className="admin-reorder-btns">
                        <button
                          className="admin-reorder-btn"
                          onClick={() => moveToExtreme(index, 'top')}
                          disabled={index === 0}
                          title="העבר להתחלה"
                        >
                          ⤒ להתחלה
                        </button>
                        <button
                          className="admin-reorder-btn"
                          onClick={() => moveToExtreme(index, 'bottom')}
                          disabled={index === images.length - 1}
                          title="העבר לסוף"
                        >
                          ⤓ לסוף
                        </button>
                      </div>
                      <div className="admin-reorder-btns">
                        <button
                          className="admin-reorder-btn"
                          onClick={() => jumpToPosition(index)}
                          title="מיקום מדויק"
                        >
                          🔢 מיקום מדויק
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        className="btn-secondary"
                        style={{ flex: 1, padding: '6px', fontSize: '0.85rem' }}
                        onClick={() => setActiveModalItem(item)}
                      >
                        🔍 הגדל
                      </button>
                      <button
                        className="admin-delete-btn"
                        style={{ flex: 1, padding: '6px' }}
                        onClick={() => handleDeleteSingle(item.url)}
                        disabled={deletingUrls.has(item.url)}
                      >
                        {deletingUrls.has(item.url) ? 'מוחק...' : '🗑️ מחק'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Popup for High-Res Inspection */}
      {activeModalItem && (
        <div className="modal-overlay" onClick={() => setActiveModalItem(null)}>
          <div className="modal-content animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveModalItem(null)}>
              ✕
            </button>
            <div className="modal-img-wrap">
              <img
                src={activeModalItem.url}
                alt={activeModalItem.greeting}
                className="modal-img"
              />
            </div>
            <div className="modal-body" style={{ background: '#ffffff', color: '#0f172a' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                "{activeModalItem.greeting}"
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <div style={{ color: '#15803d', fontWeight: 700, fontSize: '1.1rem' }}>
                  בברכה: {activeModalItem.fullName}
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                    {new Date(activeModalItem.time).toLocaleString('he-IL')}
                  </span>
                  <button
                    onClick={() => handleDeleteSingle(activeModalItem.url)}
                    style={{
                      background: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ מחק תמונה זו
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
