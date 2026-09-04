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
  aiVideoUrl?: string;
}

interface MyUploadItem {
  url: string;
  token: string;
  fullName: string;
  greeting: string;
  time: number;
}

export default function FullscreenGalleryPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideDuration, setSlideDuration] = useState(6000); // 6 seconds per slide
  const [isLoading, setIsLoading] = useState(true);
  const [isUiVisible, setIsUiVisible] = useState(false);
  const [activeAiVideoUrl, setActiveAiVideoUrl] = useState<string | null>(null);
  const [wasPlayingBeforeVideo, setWasPlayingBeforeVideo] = useState(true);

  // User's own uploads
  const [myUploads, setMyUploads] = useState<MyUploadItem[]>([]);
  const [isMyUploadsOpen, setIsMyUploadsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string>('');

  const prevImagesJsonRef = useRef<string>('');
  const hideUiTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openAiVideo = (videoUrl: string) => {
    setWasPlayingBeforeVideo(isPlaying);
    setIsPlaying(false);
    setActiveAiVideoUrl(videoUrl);
  };

  const closeAiVideo = () => {
    setActiveAiVideoUrl(null);
    if (wasPlayingBeforeVideo) {
      setIsPlaying(true);
    }
  };

  // Sync user's own uploads from localStorage and server
  useEffect(() => {
    let token = localStorage.getItem('timrat_user_token');
    if (token) setUserToken(token);

    let localItems: MyUploadItem[] = [];
    try {
      const raw = localStorage.getItem('timrat_my_uploads');
      if (raw) {
        localItems = JSON.parse(raw);
        if (Array.isArray(localItems)) {
          setMyUploads(localItems);
        }
      }
    } catch {}

    const syncWithServer = async () => {
      try {
        const extraTokens = localItems.map((i) => i.token).filter(Boolean);
        const uniqueTokens = Array.from(new Set([token, ...extraTokens].filter(Boolean))).join(',');
        if (!uniqueTokens) return;
        const res = await fetch(`/api/user/my-uploads?token=${encodeURIComponent(token || '')}&tokens=${encodeURIComponent(uniqueTokens)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            const merged: MyUploadItem[] = data.items.map((srvItem: any) => {
              const localMatch = localItems.find((l) => l.url === srvItem.url);
              return {
                url: srvItem.url,
                token: localMatch?.token || token || '',
                fullName: srvItem.fullName || localMatch?.fullName || 'תושב/ת תמרת',
                greeting: srvItem.greeting || localMatch?.greeting || '',
                time: srvItem.time || localMatch?.time || Date.now(),
              };
            });
            setMyUploads(merged);
            localStorage.setItem('timrat_my_uploads', JSON.stringify(merged));
          }
        }
      } catch {}
    };

    syncWithServer();
  }, []);

  const handleDeleteAllUploads = async () => {
    if (myUploads.length === 0) return;
    if (!confirm(`האם אתם בטוחים שברצונכם למחוק את כל ${myUploads.length} התמונות והברכות שהעליתם?\n\nהן יוסרו מיד גם ממסך ההקרנה.`)) return;

    setIsDeleting(true);
    try {
      const allTokens = Array.from(new Set([userToken, ...myUploads.map((i) => i.token)].filter(Boolean)));
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: userToken || allTokens[0],
          tokens: allTokens,
          urls: myUploads.map((i) => i.url),
          deleteAll: true,
        }),
      });

      if (res.ok) {
        setMyUploads([]);
        try {
          localStorage.removeItem('timrat_my_uploads');
        } catch {}
        setIsMyUploadsOpen(false);
        fetchImages();
        if (wasPlayingBeforeVideo) setIsPlaying(true);
        alert('כל ההעלאות שלך נמחקו בהצלחה.');
      } else {
        alert('מחיקת התכנים נכשלה.');
      }
    } catch {
      alert('שגיאה במחיקת התכנים.');
    } finally {
      setIsDeleting(false);
    }
  };

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
        }),
      });

      if (res.ok) {
        const nextUploads = myUploads.filter((i) => i.url !== item.url);
        setMyUploads(nextUploads);
        try {
          localStorage.setItem('timrat_my_uploads', JSON.stringify(nextUploads));
        } catch {}
        fetchImages();
        alert('התמונה והברכה נמחקו בהצלחה.');
      } else {
        alert('מחיקת התמונה נכשלה.');
      }
    } catch {
      alert('שגיאה במחיקת התמונה.');
    } finally {
      setDeletingUrl(null);
    }
  };

  // Fetch images from API with cache busting
  const fetchImages = async () => {
    try {
      const res = await fetch('/api/images', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const incoming = data.images || [];
        const incomingJson = JSON.stringify(incoming);
        if (incomingJson !== prevImagesJsonRef.current) {
          prevImagesJsonRef.current = incomingJson;
          setImages(incoming);
        }
      }
    } catch (err) {
      console.error('Failed to fetch gallery images:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.slideDuration && typeof data.slideDuration === 'number') {
          setSlideDuration(data.slideDuration * 1000);
        }
      }
    } catch {}
  };

  // Poll for updates every 3 seconds
  useEffect(() => {
    fetchImages();
    fetchSettings();
    const interval = setInterval(() => {
      fetchImages();
      fetchSettings();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Slideshow auto-advance timer
  useEffect(() => {
    if (!isPlaying || images.length <= 1) return;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, slideDuration);

    return () => clearTimeout(timer);
  }, [isPlaying, images.length, currentIndex, slideDuration]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      } else if (e.key === ' ' || e.key === 'k') {
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (isMyUploadsOpen) {
          setIsMyUploadsOpen(false);
          if (wasPlayingBeforeVideo) setIsPlaying(true);
        } else {
          closeAiVideo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Touch gestures for mobile swipe
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    handleMouseMove(); // Awake UI on touch
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // Horizontal swipe threshold 40px
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        // Swipe left -> advance
        setCurrentIndex((prev) => (prev + 1) % images.length);
      } else {
        // Swipe right -> previous
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // Show discreet controls temporarily on mouse movement, then fade out
  const handleMouseMove = () => {
    setIsUiVisible(true);
    if (hideUiTimerRef.current) clearTimeout(hideUiTimerRef.current);
    hideUiTimerRef.current = setTimeout(() => {
      setIsUiVisible(false);
    }, 3000);
  };

  const activeItem = images.length > 0 ? images[currentIndex % images.length] : null;
  const isVideo = activeItem?.url?.match(/\.(mp4|webm|ogg|mov)$/i);

  return (
    <main
      className="viewer-container"
      style={{
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        overflow: 'hidden',
        cursor: isUiVisible ? 'default' : 'none',
      }}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      dir="rtl"
    >
      {isLoading ? (
        <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="loader" style={{ width: '48px', height: '48px' }} />
        </div>
      ) : images.length === 0 ? (
        /* Standby festive screen when waiting for community submissions */
        <div
          style={{
            height: '100dvh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '1.5rem',
            background: 'radial-gradient(circle at 50% 50%, #1e293b 0%, #090d16 100%)',
            boxSizing: 'border-box',
          }}
        >
          <img
            src="/logo.jpeg"
            alt="תמרת"
            style={{ maxWidth: '240px', width: '80%', marginBottom: '1.5rem', filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.6))' }}
          />
          <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 900, marginBottom: '0.75rem', color: '#ffffff', letterSpacing: '-0.5px' }}>
            ברכות לשנה החדשה – קהילת תמרת
          </h1>
          <p style={{ color: '#86efac', fontSize: 'clamp(1.05rem, 2.5vw, 1.4rem)', fontWeight: 600, maxWidth: '650px', lineHeight: '1.6' }}>
            העלו תמונה וברכה לשנה החדשה שקשורה לתמונה, והן יופיעו כאן מיד על גבי המסך!
          </p>

          <a
            href="/"
            className="btn-primary"
            style={{
              marginTop: '2rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.9rem 1.8rem',
              fontSize: '1.15rem',
              borderRadius: '16px',
            }}
          >
            <span>✍️</span>
            <span>היו הראשונים להעלות ברכה ותמונה!</span>
          </a>

          <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#94a3b8', fontSize: '0.95rem' }}>
            <span className="loader" style={{ width: '20px', height: '20px' }} />
            <span>סורק ברכות חדשות בזמן אמת...</span>
          </div>
        </div>
      ) : (
        /* 100% Fullscreen Cinematic Projection Stage */
        <div className="slideshow-stage">
          {activeItem && (
            <div className="slide-media-wrapper animate-fade-in-slow" key={activeItem.id || currentIndex}>
              {/* Blurred atmospheric backdrop */}
              {!isVideo && (
                <img
                  src={activeItem.url}
                  alt=""
                  aria-hidden="true"
                  className="ambient-backdrop"
                />
              )}

              {/* Main Photo / Video */}
              <div className="slide-media-content">
                {isVideo ? (
                  <video
                    src={activeItem.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="slide-img"
                  />
                ) : (
                  <img
                    src={activeItem.url}
                    alt={activeItem.greeting || 'ברכה לשנה החדשה'}
                    className="slide-img"
                  />
                )}
              </div>

              {/* Floating Greeting Card Overlay */}
              <div className="slide-greeting-card animate-fade-in">
                {activeItem.greeting && (
                  <div className="slide-greeting-text">
                    "{activeItem.greeting}"
                  </div>
                )}
                <div className="slide-greeting-meta">
                  <div className="slide-author-name">
                    <span>🍎</span>
                    <span>{activeItem.fullName || 'תושב/ת תמרת'}</span>
                  </div>
                  <div className="slide-badge-tag">
                    קהילת תמרת 🌿 שנה טובה
                  </div>
                </div>

                {/* AI Video Button on Slide */}
                {activeItem.aiVideoUrl && (
                  <div style={{ marginTop: '0.65rem', borderTop: '1px dashed rgba(255, 255, 255, 0.2)', paddingTop: '0.55rem' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAiVideo(activeItem.aiVideoUrl!);
                      }}
                      className="slide-ai-video-btn"
                      title="לחצו לצפייה בסרטון AI"
                    >
                      <span className="ai-sparkle-icon">✨</span>
                      <span className="ai-btn-title">סרטון AI</span>
                      <span className="ai-play-triangle">▶</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Dedicated Floating AI Video Button on the Side of the Screen / Image */}
              {activeItem.aiVideoUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAiVideo(activeItem.aiVideoUrl!);
                  }}
                  className="gallery-side-ai-btn animate-fade-in"
                  title="לחצו לצפייה בסרטון AI של תמונה זו"
                >
                  <span className="ai-side-sparkle">✨</span>
                  <span className="ai-side-title">סרטון AI</span>
                  <span className="ai-side-play">▶</span>
                </button>
              )}

              {/* Top Right: Timrat Logo Watermark Badge */}
              <div className="gallery-top-right-logo">
                <img src="/logo.jpeg" alt="תמרת" />
                <span>קהילת תמרת</span>
              </div>

              {/* Top Left: Back to upload button + Slide Counter Badge */}
              <div className="gallery-top-left-bar">
                <a
                  href="/"
                  className="gallery-back-pill"
                  title="חזרה להוספת ברכה ותמונה"
                >
                  <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>✍️</span>
                  <span>להוספת ברכה</span>
                </a>

                {myUploads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setWasPlayingBeforeVideo(isPlaying);
                      setIsPlaying(false);
                      setIsMyUploadsOpen(true);
                    }}
                    className="gallery-back-pill"
                    style={{
                      borderColor: 'rgba(74, 222, 128, 0.45)',
                      color: '#4ade80',
                      cursor: 'pointer',
                    }}
                    title="צפייה וניהול ההעלאות שלי"
                  >
                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>📸</span>
                    <span>ההעלאות שלי ({myUploads.length})</span>
                  </button>
                )}

                <div className="gallery-counter-pill">
                  {currentIndex + 1} / {images.length}
                </div>
              </div>

              {/* Discreet Navigation Controls (appear on mouse movement or touch) */}
              <div
                style={{
                  opacity: isUiVisible ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  pointerEvents: isUiVisible ? 'auto' : 'none',
                }}
              >
                <button
                  onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
                  className="gallery-nav-arrow"
                  style={{ right: '1.25rem' }}
                  title="הקודם"
                  aria-label="תמונה קודמת"
                >
                  ❯
                </button>

                <button
                  onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
                  className="gallery-nav-arrow"
                  style={{ left: '1.25rem' }}
                  title="הבא"
                  aria-label="תמונה הבאה"
                >
                  ❮
                </button>

                {/* Bottom discreet action pills (Play/Pause, Fullscreen) */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '1.5rem',
                    left: '2rem',
                    zIndex: 30,
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'rgba(15, 23, 42, 0.75)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {isPlaying ? '⏸️ השהה' : '▶️ נגן'}
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    style={{
                      background: 'rgba(15, 23, 42, 0.75)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.2)',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    ⛶ מסך מלא
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Video Modal Player in Gallery */}
      {activeAiVideoUrl && (
        <div
          className="modal-overlay animate-fade-in"
          style={{ zIndex: 100, background: 'rgba(0, 0, 0, 0.94)' }}
          onClick={closeAiVideo}
        >
          <div
            className="ai-video-modal-card animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={closeAiVideo}
              title="סגירה וחזרה למצגת (Esc)"
              aria-label="סגירה"
            >
              ✕
            </button>
            <div className="ai-video-player-container">
              <video
                src={activeAiVideoUrl}
                controls
                autoPlay
                playsInline
                loop
                className="ai-video-screen"
              />
            </div>
            <div className="ai-video-modal-bar">
              <div className="ai-modal-badge">
                <span className="ai-sparkle-icon">✨</span>
                <span>סרטון AI – קהילת תמרת</span>
              </div>
              <button
                type="button"
                onClick={closeAiVideo}
                className="btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.9rem', borderRadius: '20px' }}
              >
                חזרה למצגת ⤶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "My Uploads" Management Modal in Gallery */}
      {isMyUploadsOpen && (
        <div
          className="my-uploads-modal-overlay"
          style={{ zIndex: 120 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsMyUploadsOpen(false);
              if (wasPlayingBeforeVideo) setIsPlaying(true);
            }
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
                onClick={() => {
                  setIsMyUploadsOpen(false);
                  if (wasPlayingBeforeVideo) setIsPlaying(true);
                }}
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
                    לא נמצאו העלאות פעילות ממכשיר זה
                  </div>
                  <a
                    href="/"
                    className="btn-primary"
                    style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', fontSize: '0.95rem', textDecoration: 'none' }}
                  >
                    העלאת ברכה ראשונה ✨
                  </a>
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
                      ⚠️ לחיצה על כפתור זה תמחק לצמיתות את כל התמונות והברכות שהעליתם, והן יוסרו מיד ממסך ההקרנה.
                    </div>
                  </div>

                  <div className="my-uploads-list">
                    {myUploads.map((item) => (
                      <div className="my-upload-card" key={item.url}>
                        <img src={item.url} alt="העלאה שלי" className="my-upload-thumb" />
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
