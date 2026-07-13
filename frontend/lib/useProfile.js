'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';

const INVALID_AUTH_CODES = new Set([
  'bad_jwt',
  'invalid_token',
  'refresh_token_not_found',
  'session_not_found',
  'user_not_found',
]);

function isInvalidAuthentication(error) {
  const status = Number(error?.status);
  return status === 400
    || status === 401
    || status === 403
    || INVALID_AUTH_CODES.has(error?.code);
}

function logProfileDiagnostic(context, error) {
  console.error('[Profile] request failed', {
    context,
    code: error?.code || null,
    status: error?.status || null,
  });
}

export function useProfile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const requestRef = useRef(0);

  const loadProfile = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setProfileError(false);
    let authenticatedUser = null;

    try {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

      if (requestId !== requestRef.current) return;

      if (!currentUser && !authError) {
        setUser(null);
        setProfile(null);
        router.replace('/login');
        return;
      }

      if (authError) {
        if (isInvalidAuthentication(authError)) {
          setUser(null);
          setProfile(null);
          router.replace('/login');
        } else {
          logProfileDiagnostic('authentication', authError);
          setProfileError(true);
        }
        return;
      }

      authenticatedUser = currentUser;
      setUser(currentUser);

      const { data: profileData, error: profileQueryError } = await supabase
        .from('profiles')
        .select(`
          *,
          university:universities(id, short_name, name, city, brand_color)
        `)
        .eq('id', currentUser.id)
        .maybeSingle();

      if (requestId !== requestRef.current) return;

      if (profileQueryError) {
        logProfileDiagnostic('profile', profileQueryError);
        setProfile(null);
        setProfileError(true);
      } else {
        setProfile(profileData || null);
      }
    } catch (error) {
      if (requestId !== requestRef.current) return;
      logProfileDiagnostic(authenticatedUser ? 'profile' : 'authentication', error);
      if (authenticatedUser) {
        setUser(authenticatedUser);
        setProfile(null);
      }
      setProfileError(true);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [router]);

  useEffect(() => {
    loadProfile();
    return () => {
      requestRef.current += 1;
    };
  }, [loadProfile]);

  return {
    user,
    profile,
    loading,
    profileError,
    refreshProfile: loadProfile,
    isAdmin: Boolean(profile?.is_admin),
  };
}
