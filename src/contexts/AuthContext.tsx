import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_individual: boolean;
  is_active: boolean;
  company_id: string | null;
  last_login: string | null;
  login_count: number;
}

interface ClientCompany {
  id: string;
  company_name: string;
  ticker: string | null;
  plan_type: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  company: ClientCompany | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [company, setCompany] = useState<ClientCompany | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return;
      }

      setProfile(profileData as UserProfile);

      // Fetch company if user has one
      if (profileData?.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from('client_companies')
          .select('*')
          .eq('id', profileData.company_id)
          .single();

        if (!companyError && companyData) {
          setCompany(companyData as ClientCompany);
        }
      }

      // Update last_login
      await supabase
        .from('user_profiles')
        .update({ 
          last_login: new Date().toISOString(),
          login_count: (profileData?.login_count || 0) + 1
        })
        .eq('id', userId);

    } catch (error) {
      console.error('Error in fetchProfile:', error);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCompany(null);
        }

        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setCompany(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMagicLink = async (email: string): Promise<{ error: string | null }> => {
    try {
      // First check if the email exists in user_profiles
      // Note: This is a soft check - the actual validation happens server-side
      const redirectUrl = `${window.location.origin}/dashboard`;
      
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.message.includes('Email not confirmed') || error.message.includes('Invalid login credentials')) {
          return { error: 'Email no registrado. Contacta con el administrador.' };
        }
        return { error: error.message };
      }

      return { error: null };
    } catch (error) {
      console.error('Error sending magic link:', error);
      return { error: 'Error al enviar el enlace. Inténtalo de nuevo.' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setCompany(null);
      toast({
        title: "Sesión cerrada",
        description: "Has cerrado sesión correctamente.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "No se pudo cerrar la sesión.",
        variant: "destructive",
      });
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    company,
    isLoading,
    isAuthenticated: !!session && !!user,
    sendMagicLink,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
