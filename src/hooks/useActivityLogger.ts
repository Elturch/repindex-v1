import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface EventData {
  [key: string]: string | number | boolean | null | undefined;
}

const getDeviceType = (): string => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

const getBrowser = (): string => {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Other';
};

const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('activity_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('activity_session_id', sessionId);
    sessionStorage.setItem('session_start_at', new Date().toISOString());
  }
  return sessionId;
};

const getSessionStartAt = (): string => {
  return sessionStorage.getItem('session_start_at') || new Date().toISOString();
};

export function useActivityLogger() {
  const location = useLocation();
  const lastPageView = useRef<string | null>(null);
  const pageStartTime = useRef<number>(Date.now());
  const currentUserId = useRef<string | null>(null);

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      currentUserId.current = data.user?.id || null;
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      currentUserId.current = session?.user?.id || null;
    });

    return () => subscription.unsubscribe();
  }, []);

  const logEvent = useCallback(async (
    eventType: string,
    eventData: EventData = {},
    pagePath?: string
  ) => {
    try {
      const sessionId = getSessionId();
      
      await supabase.from('user_activity_logs').insert({
        user_id: currentUserId.current,
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
        page_path: pagePath || location.pathname,
        page_title: document.title,
        referrer: document.referrer || null,
        device_type: getDeviceType(),
        browser: getBrowser(),
        screen_width: window.innerWidth,
        session_start_at: getSessionStartAt(),
        time_on_page_seconds: null
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }, [location.pathname]);

  const logPageView = useCallback(async (path: string) => {
    // Log time on previous page if exists
    if (lastPageView.current && lastPageView.current !== path) {
      const timeOnPage = Math.round((Date.now() - pageStartTime.current) / 1000);
      
      try {
        const sessionId = getSessionId();
        
        await supabase.from('user_activity_logs').insert({
          user_id: currentUserId.current,
          session_id: sessionId,
          event_type: 'page_exit',
          event_data: { previous_path: lastPageView.current },
          page_path: lastPageView.current,
          page_title: document.title,
          device_type: getDeviceType(),
          browser: getBrowser(),
          screen_width: window.innerWidth,
          session_start_at: getSessionStartAt(),
          time_on_page_seconds: timeOnPage
        });
      } catch (error) {
        console.error('Failed to log page exit:', error);
      }
    }

    // Log new page view
    lastPageView.current = path;
    pageStartTime.current = Date.now();

    await logEvent('page_view', { path }, path);
  }, [logEvent]);

  // Auto-track page views
  useEffect(() => {
    logPageView(location.pathname);
  }, [location.pathname, logPageView]);

  // Log session start on first load
  useEffect(() => {
    const hasLoggedSession = sessionStorage.getItem('session_logged');
    if (!hasLoggedSession) {
      logEvent('session_start', { referrer: document.referrer });
      sessionStorage.setItem('session_logged', 'true');
    }
  }, [logEvent]);

  // Log session end on page unload
  useEffect(() => {
    const handleUnload = () => {
      const timeOnPage = Math.round((Date.now() - pageStartTime.current) / 1000);
      const sessionStart = new Date(getSessionStartAt()).getTime();
      const totalDuration = Math.round((Date.now() - sessionStart) / 1000);

      // Use sendBeacon for reliable logging on page unload
      const data = JSON.stringify({
        user_id: currentUserId.current,
        session_id: getSessionId(),
        event_type: 'session_end',
        event_data: { duration_seconds: totalDuration, last_page_time: timeOnPage },
        page_path: location.pathname,
        device_type: getDeviceType(),
        browser: getBrowser(),
        screen_width: window.innerWidth,
        session_start_at: getSessionStartAt(),
        time_on_page_seconds: timeOnPage
      });

      navigator.sendBeacon(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://jzkjykmrwisijiqlwuua.supabase.co'}/rest/v1/user_activity_logs`,
        new Blob([data], { type: 'application/json' })
      );
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [location.pathname]);

  return { logEvent, logPageView };
}
