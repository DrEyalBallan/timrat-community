'use client';

import React, { useState, useEffect, useRef } from 'react';
import { uploadMediaWithProgress, uploadVideoToCloudinary } from '@/lib/clientUpload';
import { isMediaVideo } from '@/lib/mediaUtils';

interface ImageItem {
  id: string;
  url: string;
  firstName: string;
  lastName: string;
  fullName: string;
  greeting: string;
  time: number;
  aiVideoUrl?: string;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingUrls, setDeletingUrls] = useState<Set<string>>(new Set());
  const deletedUrlsRef = useRef<Set<string>>(new Set());
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

  // AI Video state
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoMsg, setVideoMsg] = useState('');
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const directVideoFileInputRef = useRef<HTMLInputElement>(null);
  const standaloneVideoInputRef = useRef<HTMLInputElement>(null);
  const [directUploadingUrl, setDirectUploadingUrl] = useState<string | null>(null);
  const [targetItemForDirectUpload, setTargetItemForDirectUpload] = useState<string | null>(null);

  // Admin Custom Upload state
  const [isCustomUploadOpen, setIsCustomUploadOpen] = useState(false);
  const [adminCustomFile, setAdminCustomFile] = useState<File | null>(null);
  const [adminCustomPreview, setAdminCustomPreview] = useState<string>('');
  const [adminCustomName, setAdminCustomName] = useState<string>('קהילת תמרת');
  const [adminCustomGreeting, setAdminCustomGreeting] = useState<string>('שנה טובה ומבורכת מקהילת תמרת!');
  const [isAdminCustomUploading, setIsAdminCustomUploading] = useState<boolean>(false);

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
        const incoming = (data.images || []).filter((img: ImageItem) => !deletedUrlsRef.current.has(img.url));
        setImages(incoming);
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

    deletedUrlsRef.current.add(url);
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
        deletedUrlsRef.current.delete(url);
        alert('אין הרשאה! סיסמת מנהל שגויה.');
        handleLogout();
      } else {
        deletedUrlsRef.current.delete(url);
        const data = await res.json();
        alert('שגיאה במחיקה: ' + (data.error || 'שגיאה לא ידועה'));
      }
    } catch (err) {
      deletedUrlsRef.current.delete(url);
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
    targetUrls.forEach((u) => deletedUrlsRef.current.add(u));

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
        targetUrls.forEach((u) => deletedUrlsRef.current.delete(u));
        alert('אין הרשאה! סיסמה שגויה.');
        handleLogout();
      } else {
        targetUrls.forEach((u) => deletedUrlsRef.current.delete(u));
        const data = await res.json();
        alert('שגיאה במחיקה: ' + (data.error || 'שגיאה לא ידועה'));
      }
    } catch (err) {
      targetUrls.forEach((u) => deletedUrlsRef.current.delete(u));
      console.error('Delete selected error', err);
      alert('שגיאה במחיקת הפריטים הנבחרים.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    setIsBulkUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });

    let successCount = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const isVid = isMediaVideo(file.name) || file.type.startsWith('video/');
        await uploadMediaWithProgress({
          file,
          firstName: 'קהילת',
          lastName: 'תמרת',
          greeting: isVid ? 'סרטון קהילת תמרת 🎬 שנה טובה ומבורכת!' : 'שנה טובה ומבורכת מקהילת תמרת!',
        });
        successCount++;
        setUploadProgress({ current: successCount, total: fileList.length });
      } catch (err) {
        console.error('Failed to upload file:', file.name, err);
      }
    }

    setIsBulkUploading(false);
    e.target.value = '';
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    alert(`✅ הועלו בהצלחה ${successCount} מתוך ${fileList.length} קבצים!`);
    fetchImages(password);
  };

  const handleUploadStandaloneVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBulkUploading(true);
    setUploadProgress({ current: 0, total: 1 });

    try {
      await uploadMediaWithProgress({
        file,
        firstName: 'קהילת',
        lastName: 'תמרת',
        greeting: 'סרטון קהילת תמרת 🎬 שנה טובה ומבורכת!',
        onProgress: (pct) => {
          // progress updates
        },
      });

      setUploadProgress({ current: 1, total: 1 });
      alert('✅ סרטון הווידאו הועלה בהצלחה למסך ההקרנה ולגלריה!');
    } catch (err: any) {
      alert('⚠️ ' + (err?.message || 'שגיאה בהעלאת הווידאו'));
    } finally {
      setIsBulkUploading(false);
      e.target.value = '';
      if (standaloneVideoInputRef.current) {
        standaloneVideoInputRef.current.value = '';
      }
      fetchImages(password);
    }
  };

  const handleAdminCustomFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAdminCustomFile(file);
    const isVid = isMediaVideo(file.name) || file.type.startsWith('video/');
    if (isVid) {
      setAdminCustomPreview(URL.createObjectURL(file));
    } else {
      const reader = new FileReader();
      reader.onload = () => setAdminCustomPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAdminCustomUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCustomFile) {
      alert('נא לבחור קובץ תמונה או סרטון');
      return;
    }
    setIsAdminCustomUploading(true);
    try {
      const nameParts = adminCustomName.trim().split(' ');
      const fName = nameParts[0] || 'קהילת';
      const lName = nameParts.slice(1).join(' ') || 'תמרת';
      const greet = adminCustomGreeting || 'שנה טובה ומבורכת!';

      await uploadMediaWithProgress({
        file: adminCustomFile,
        firstName: fName,
        lastName: lName,
        greeting: greet,
      });

      alert('✅ הקובץ והברכה הועלו בהצלחה למסך ההקרנה ולגלריה!');
      setAdminCustomFile(null);
      setAdminCustomPreview('');
      setIsCustomUploadOpen(false);
      fetchImages(password);
    } catch (err: any) {
      alert('⚠️ שגיאה: ' + (err?.message || 'ההעלאה נכשלה'));
    } finally {
      setIsAdminCustomUploading(false);
    }
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

  const handleTriggerDirectVideoUpload = (itemUrl: string) => {
    setTargetItemForDirectUpload(itemUrl);
    if (directVideoFileInputRef.current) {
      directVideoFileInputRef.current.value = '';
      directVideoFileInputRef.current.click();
    }
  };

  const handleDirectFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetItemForDirectUpload) return;
    const target = targetItemForDirectUpload;
    setDirectUploadingUrl(target);
    try {
      await handleUploadAiVideo(target, file, '');
    } finally {
      setDirectUploadingUrl(null);
      setTargetItemForDirectUpload(null);
    }
  };

  const handleUploadAiVideo = async (targetImageUrl: string | string[], file: File | null, customUrl: string) => {
    const isMultiple = Array.isArray(targetImageUrl);
    const targetUrls = isMultiple ? targetImageUrl : [targetImageUrl];

    if (targetUrls.length === 0) return;
    if (!file && !customUrl.trim()) {
      alert('נא לבחור קובץ וידאו מהמחשב או להזין קישור תקין');
      return;
    }

    const firstUrl = targetUrls[0];
    setDirectUploadingUrl(isMultiple ? 'bulk' : firstUrl);
    setIsUploadingVideo(true);
    setVideoMsg('מעלה סרטון וידאו לענן...');
    setVideoUploadProgress(10);

    let uploadedVideoUrl = customUrl.trim();

    if (file) {
      try {
        uploadedVideoUrl = await uploadVideoToCloudinary(file, (pct) => {
          setVideoUploadProgress(pct);
        });
      } catch (err: any) {
        console.warn('Direct upload error:', err);
        alert('⚠️ שגיאה בהעלאת הווידאו: ' + (err.message || 'ההעלאה נכשלה'));
        setIsUploadingVideo(false);
        setDirectUploadingUrl(null);
        setVideoUploadProgress(0);
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          imageUrls: targetUrls,
          action: 'attach',
          videoUrl: uploadedVideoUrl,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'צירוף הסרטון נכשל');
      }

      const targetSet = new Set(targetUrls);
      setImages((prev) =>
        prev.map((img) =>
          targetSet.has(img.url) ? { ...img, aiVideoUrl: uploadedVideoUrl } : img
        )
      );

      if (activeModalItem && targetSet.has(activeModalItem.url)) {
        setActiveModalItem((prev) => (prev ? { ...prev, aiVideoUrl: uploadedVideoUrl } : null));
      }

      setVideoMsg('✅ סרטון הווידאו נשמר בהצלחה!');
      setSelectedVideoFile(null);
      setVideoUrlInput('');
      if (videoFileInputRef.current) videoFileInputRef.current.value = '';
      alert(isMultiple ? `✅ הסרטון צורף בהצלחה ל-${targetUrls.length} תמונות!` : '✅ הסרטון צורף בהצלחה לתמונה!');
      setTimeout(() => setVideoMsg(''), 3000);
    } catch (err: any) {
      setVideoMsg('⚠️ ' + (err.message || 'שגיאה בצירוף הווידאו'));
      alert('⚠️ ' + (err.message || 'שגיאה בצירוף הווידאו'));
    } finally {
      setIsUploadingVideo(false);
      setDirectUploadingUrl(null);
      setVideoUploadProgress(0);
    }
  };

  const handleRemoveAiVideo = async (targetImageUrl: string | string[]) => {
    const isMultiple = Array.isArray(targetImageUrl);
    const targetUrls = isMultiple ? targetImageUrl : [targetImageUrl];
    if (!confirm(`האם אתם בטוחים שברצונכם להסיר את סרטון הווידאו מ-${isMultiple ? targetUrls.length + ' תמונות' : 'תמונה זו'}?`)) return;

    setIsUploadingVideo(true);
    setVideoMsg('מסיר סרטון...');
    try {
      const res = await fetch('/api/admin/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          imageUrls: targetUrls,
          action: 'remove',
        }),
      });

      if (res.ok) {
        const targetSet = new Set(targetUrls);
        setImages((prev) =>
          prev.map((img) => {
            if (targetSet.has(img.url)) {
              const copy = { ...img };
              delete copy.aiVideoUrl;
              return copy;
            }
            return img;
          })
        );
        if (activeModalItem && targetSet.has(activeModalItem.url)) {
          setActiveModalItem((prev) => {
            if (!prev) return null;
            const copy = { ...prev };
            delete copy.aiVideoUrl;
            return copy;
          });
        }
        alert('✅ הסרטון הוסר בהצלחה');
      }
    } catch (e) {
      alert('שגיאה בהסרת הסרטון');
    } finally {
      setIsUploadingVideo(false);
      setVideoMsg('');
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
          {/* Global Hidden File Inputs */}
          <input
            type="file"
            accept="image/*,video/*,.mp4,.mov,.webm,.m4v"
            multiple
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleBulkUpload}
          />
          <input
            type="file"
            accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
            style={{ display: 'none' }}
            ref={standaloneVideoInputRef}
            onChange={handleUploadStandaloneVideo}
          />
          <input
            type="file"
            ref={directVideoFileInputRef}
            accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
            style={{ display: 'none' }}
            onChange={handleDirectFileSelected}
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

          <label
            className="btn-secondary"
            style={{
              cursor: isBulkUploading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <input
              type="file"
              accept="image/*,video/*,.mp4,.mov,.webm,.m4v,.jpeg,.jpg,.png,.heic"
              multiple
              style={{ display: 'none' }}
              disabled={isBulkUploading}
              onChange={handleBulkUpload}
            />
            <span>{isBulkUploading ? `מעלה ${uploadProgress.current}/${uploadProgress.total}...` : '📤 העלאת תמונות וסרטונים'}</span>
          </label>

          <label
            className="btn-secondary"
            style={{
              background: '#f0fdf4',
              borderColor: '#16a34a',
              color: '#15803d',
              fontWeight: 700,
              cursor: isBulkUploading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
            title="העלאת סרטון וידאו חדש מהמכשיר ישירות למסך ההקרנה"
          >
            <input
              type="file"
              accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
              style={{ display: 'none' }}
              disabled={isBulkUploading}
              onChange={handleUploadStandaloneVideo}
            />
            <span>🎬 העלאת סרטון חדש למסך</span>
          </label>

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

      {/* Prominent Admin Upload Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          border: '2px solid #86efac',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 15px rgba(22, 163, 74, 0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#14532d', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span>📤</span>
              <span>העלאת תמונות וסרטונים חדשים למסך ההקרנה</span>
            </h2>
            <p style={{ color: '#475569', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
              העלו סרטוני וידאו (MP4, MOV) או תמונות (JPG, PNG, HEIC) שיוצגו מיד על מסך ההקרנה ביישוב.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label
              className="btn-primary"
              style={{
                cursor: 'pointer',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '0.95rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
              }}
              title="לחצו לבחירת סרטון וידאו (MP4, MOV וכו') מהמכשיר"
            >
              <input
                type="file"
                accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                style={{ display: 'none' }}
                onChange={handleUploadStandaloneVideo}
              />
              <span>🎬</span>
              <span>העלאת סרטון וידאו למסך</span>
            </label>

            <label
              className="btn-primary"
              style={{
                cursor: 'pointer',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '0.95rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
              }}
              title="לחצו לבחירת תמונות להעלאה"
            >
              <input
                type="file"
                accept="image/*,video/*,.mp4,.mov,.webm,.m4v"
                multiple
                style={{ display: 'none' }}
                onChange={handleBulkUpload}
              />
              <span>📸</span>
              <span>העלאת תמונות מהמכשיר</span>
            </label>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsCustomUploadOpen(!isCustomUploadOpen)}
              style={{ padding: '9px 16px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700 }}
            >
              {isCustomUploadOpen ? '✕ סגור טופס' : '✍️ העלאה עם ברכה אישית'}
            </button>
          </div>
        </div>

        {isBulkUploading && (
          <div style={{ marginTop: '1rem', background: '#dcfce7', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="loader" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
            <span style={{ fontWeight: 700, color: '#166534', fontSize: '0.9rem' }}>
              מעלה קובץ לענן... {uploadProgress.current}/{uploadProgress.total}
            </span>
          </div>
        )}

        {/* Custom Upload Form */}
        {isCustomUploadOpen && (
          <form onSubmit={handleAdminCustomUpload} style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #cbd5e1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px', color: '#1e293b' }}>
                  שם המברך / שולח:
                </label>
                <input
                  type="text"
                  className="modern-input"
                  value={adminCustomName}
                  onChange={(e) => setAdminCustomName(e.target.value)}
                  placeholder="לדוגמה: משפחת כהן או קהילת תמרת"
                  style={{ padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px', color: '#1e293b' }}>
                  תוכן הברכה:
                </label>
                <input
                  type="text"
                  className="modern-input"
                  value={adminCustomGreeting}
                  onChange={(e) => setAdminCustomGreeting(e.target.value)}
                  placeholder="שנה טובה ומבורכת!"
                  style={{ padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '4px', color: '#1e293b' }}>
                  בחירת קובץ (תמונה או סרטון):
                </label>
                <input
                  type="file"
                  accept="image/*,video/*,.mp4,.mov,.webm,.m4v"
                  onChange={handleAdminCustomFileSelect}
                  style={{ fontSize: '0.85rem', padding: '6px' }}
                />
              </div>
            </div>

            {adminCustomPreview && (
              <div style={{ marginBottom: '1rem' }}>
                {adminCustomFile?.type?.startsWith('video/') || !!adminCustomFile?.name?.match(/\.(mp4|mov|webm|ogg|m4v)$/i) ? (
                  <video src={adminCustomPreview} controls style={{ maxHeight: '160px', borderRadius: '8px' }} />
                ) : (
                  <img src={adminCustomPreview} alt="תצוגה" style={{ maxHeight: '160px', borderRadius: '8px' }} />
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={isAdminCustomUploading || !adminCustomFile}
              style={{ padding: '9px 24px', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 700 }}
            >
              {isAdminCustomUploading ? 'מעלה לענן...' : '🚀 פרסם עכשיו למסך ההקרנה'}
            </button>
          </form>
        )}
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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-secondary"
              onClick={handleSelectAll}
              style={{ padding: '6px 12px', fontSize: '0.9rem' }}
            >
              {selectedUrls.size === images.length ? 'בטל בחירת הכל' : 'בחר הכל'}
            </button>

            {selectedUrls.size > 0 && (
              <>
                <label
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: isUploadingVideo ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                  }}
                  title="העלה סרטון מהמחשב וקשר אותו לתמונות שנבחרו"
                >
                  <input
                    type="file"
                    accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                    style={{ display: 'none' }}
                    disabled={isUploadingVideo}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadAiVideo(Array.from(selectedUrls), file, '');
                        e.target.value = '';
                      }
                    }}
                  />
                  <span>🎬</span>
                  <span>צרף סרטון מהמחשב ל-{selectedUrls.size} הנבחרים</span>
                </label>

                <button
                  className="admin-delete-btn"
                  style={{ width: 'auto', padding: '6px 16px' }}
                  onClick={handleDeleteSelected}
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? 'מוחק...' : `🗑️ מחק ${selectedUrls.size} נבחרים`}
                </button>
              </>
            )}

            {images.length > 0 && selectedUrls.size === 0 && (
              <label
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  color: '#1e293b',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isUploadingVideo ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="העלה סרטון מהמחשב וקשר אותו לכל התמונות של התושבים"
              >
                <input
                  type="file"
                  accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                  style={{ display: 'none' }}
                  disabled={isUploadingVideo}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (confirm(`האם להעלות סרטון זה מהמחשב ולקשר אותו לכל ${images.length} התמונות של התושבים?`)) {
                        handleUploadAiVideo(images.map((img) => img.url), file, '');
                      }
                      e.target.value = '';
                    }
                  }}
                />
                <span>🎬</span>
                <span>צרף סרטון מהמחשב לכל {images.length} התמונות</span>
              </label>
            )}
          </div>
        )}

        {directUploadingUrl === 'bulk' && (
          <div
            style={{
              width: '100%',
              background: '#ecfdf5',
              border: '1.5px solid #10b981',
              borderRadius: '10px',
              padding: '10px 16px',
              marginTop: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: 700, fontSize: '0.9rem' }}>
              <span className="loader" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
              <span>מעלה סרטון מהמחשב לענן ומקשר לתמונות... {videoUploadProgress > 0 && `${videoUploadProgress}%`}</span>
            </div>
            {videoUploadProgress > 0 && (
              <div style={{ width: '180px', height: '8px', background: '#d1fae5', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#10b981', width: `${videoUploadProgress}%`, transition: 'width 0.2s' }} />
              </div>
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
                {isMediaVideo(item.url) ? (
                  <video src={item.url} muted playsInline className="grid-card-img" />
                ) : (
                  <img src={item.url} alt={item.greeting} className="grid-card-img" loading="lazy" />
                )}
              </div>
              <div className="grid-card-body">
                <div className="grid-card-greeting" style={{ color: '#0f172a' }}>
                  "{item.greeting}"
                </div>
                {directUploadingUrl === item.url ? (
                  <div style={{
                    margin: '6px 0',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    padding: '4px 6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}>
                    <span className="loader" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                    <span>מעלה... {videoUploadProgress > 0 && `${videoUploadProgress}%`}</span>
                  </div>
                ) : item.aiVideoUrl ? (
                  <div style={{
                    margin: '4px 0',
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    padding: '3px 6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span>🎬 סרטון מקושר</span>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}
                      title="החלף סרטון מהמחשב"
                    >
                      <input
                        type="file"
                        accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadAiVideo(item.url, file, '');
                            e.target.value = '';
                          }
                        }}
                      />
                      החלף
                    </label>
                  </div>
                ) : (
                  <div style={{ margin: '4px 0' }}>
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #10b981',
                        color: '#047857',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        width: '100%',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}
                      title="העלאת סרטון מהמחשב לתמונה זו"
                    >
                      <input
                        type="file"
                        accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUploadAiVideo(item.url, file, '');
                            e.target.value = '';
                          }
                        }}
                      />
                      <span>🎬 צרף סרטון מהמחשב</span>
                    </label>
                  </div>
                )}
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
            const isVideo = isMediaVideo(item.url);

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
                    <video src={item.url} muted playsInline className="admin-card-img" />
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
                    <div>
                      {directUploadingUrl === item.url ? (
                        <div style={{
                          margin: '6px 0',
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid #f59e0b',
                          borderRadius: '8px',
                          padding: '8px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: '#d97706',
                          textAlign: 'center',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            <span className="loader" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                            <span>מעלה סרטון מהמחשב לענן... {videoUploadProgress > 0 && `${videoUploadProgress}%`}</span>
                          </div>
                        </div>
                      ) : item.aiVideoUrl ? (
                        <div style={{
                          margin: '6px 0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: '8px',
                          padding: '5px 8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#b45309',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🎬</span>
                            <span>סרטון מקושר</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setActiveModalItem(item)}
                              style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700, fontSize: '0.8rem' }}
                            >
                              צפה
                            </button>
                            <label
                              style={{
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                color: '#2563eb',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                              title="החלפת סרטון קיים בסרטון חדש מהמחשב"
                            >
                              <input
                                type="file"
                                accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleUploadAiVideo(item.url, file, '');
                                    e.target.value = '';
                                  }
                                }}
                              />
                              החלף סרטון מהמחשב
                            </label>
                            <button
                              type="button"
                              onClick={() => handleRemoveAiVideo(item.url)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700, fontSize: '0.8rem' }}
                            >
                              הסר
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label
                          style={{
                            margin: '6px 0',
                            width: '100%',
                            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                            border: '1.5px dashed #10b981',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: '#047857',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.12)',
                            boxSizing: 'border-box',
                          }}
                          title="לחצו לבחירת קובץ וידאו מהמחשב לתמונה זו"
                        >
                          <input
                            type="file"
                            accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleUploadAiVideo(item.url, file, '');
                                e.target.value = '';
                              }
                            }}
                          />
                          <span style={{ fontSize: '1rem' }}>🎬</span>
                          <span>העלאת סרטון מהמחשב לתמונה זו</span>
                        </label>
                      )}

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
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Popup for High-Res Inspection & AI Video Management */}
      {activeModalItem && (
        <div className="modal-overlay" onClick={() => setActiveModalItem(null)}>
          <div className="modal-content animate-fade-in" style={{ maxWidth: '750px' }} onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setActiveModalItem(null)}>
              ✕
            </button>
            <div className="modal-img-wrap">
              {isMediaVideo(activeModalItem.url) ? (
                <video
                  src={activeModalItem.url}
                  controls
                  autoPlay
                  playsInline
                  className="modal-img"
                  style={{ maxHeight: '520px', width: '100%', objectFit: 'contain', background: '#000', borderRadius: '12px' }}
                />
              ) : (
                <img
                  src={activeModalItem.url}
                  alt={activeModalItem.greeting}
                  className="modal-img"
                />
              )}
            </div>
            <div className="modal-body" style={{ background: '#ffffff', color: '#0f172a' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                "{activeModalItem.greeting}"
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.65rem' }}>
                <div style={{ color: '#15803d', fontWeight: 700, fontSize: '1.05rem' }}>
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

              {/* AI Video Management Section in Modal */}
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '14px',
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>
                    <span>🎬</span>
                    <span>סרטון וידאו מקושר לתמונה זו</span>
                  </div>
                  {activeModalItem.aiVideoUrl && (
                    <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700 }}>
                      קיים סרטון פעיל
                    </span>
                  )}
                </div>

                {activeModalItem.aiVideoUrl ? (
                  <div>
                    <div style={{ width: '100%', maxHeight: '260px', borderRadius: '12px', overflow: 'hidden', background: '#000', marginBottom: '0.75rem' }}>
                      <video
                        src={activeModalItem.aiVideoUrl}
                        controls
                        playsInline
                        style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveAiVideo(activeModalItem.url)}
                        disabled={isUploadingVideo}
                        style={{
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: '1px solid #fca5a5',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        🗑️ הסרת הסרטון
                      </button>
                      <label
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        title="בחירת קובץ וידאו חדש מהמחשב"
                      >
                        <input
                          type="file"
                          accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedVideoFile(file);
                              handleUploadAiVideo(activeModalItem.url, file, '');
                              e.target.value = '';
                            }
                          }}
                        />
                        🔄 החלפת סרטון מהמחשב
                      </label>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                      העלו סרטון וידאו ישירות מהמחשב שלכם (MP4, MOV וכו') או הדביקו קישור. בגלריה ובהקרנה יוצג כפתור צפייה בסרטון.
                    </p>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <label
                        className="btn-primary"
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.9rem',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        title="בחירת קובץ וידאו מהמחשב"
                      >
                        <input
                          type="file"
                          accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setSelectedVideoFile(file);
                              handleUploadAiVideo(activeModalItem.url, file, '');
                              e.target.value = '';
                            }
                          }}
                        />
                        📁 בחירת סרטון מהמחשב שלי
                      </label>

                      <span style={{ alignSelf: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>או</span>

                      <input
                        type="url"
                        placeholder="הדבקת קישור ישיר לווידאו (URL)..."
                        value={videoUrlInput}
                        onChange={(e) => setVideoUrlInput(e.target.value)}
                        disabled={isUploadingVideo}
                        style={{
                          flex: 1,
                          minWidth: '200px',
                          padding: '7px 12px',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.88rem',
                          textAlign: 'right',
                          direction: 'ltr',
                        }}
                      />

                      {videoUrlInput && (
                        <button
                          type="button"
                          onClick={() => handleUploadAiVideo(activeModalItem.url, null, videoUrlInput)}
                          disabled={isUploadingVideo}
                          className="btn-primary"
                          style={{ padding: '7px 14px', fontSize: '0.88rem', borderRadius: '10px' }}
                        >
                          💾 שמירת קישור
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Modal video file input */}
                <input
                  type="file"
                  ref={videoFileInputRef}
                  accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedVideoFile(file);
                      handleUploadAiVideo(activeModalItem.url, file, '');
                    }
                  }}
                />

                {/* Upload progress & status messages */}
                {isUploadingVideo && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', color: '#15803d', fontWeight: 700 }}>
                      <span className="loader" style={{ width: '16px', height: '16px' }} />
                      <span>{videoMsg || 'מעלה סרטון AI לענן...'}</span>
                    </div>
                    {videoUploadProgress > 0 && (
                      <div className="progress-bar-wrap" style={{ height: '6px', marginTop: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${videoUploadProgress}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {videoMsg && !isUploadingVideo && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.88rem', fontWeight: 700, color: videoMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                    {videoMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
