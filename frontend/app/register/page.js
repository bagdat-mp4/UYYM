'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Upload } from 'lucide-react';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import { useLang } from '@/lib/LanguageProvider';
import './register.css';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, setLang, t } = useLang();
  const [step, setStep] = useState(1);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1 state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2 state
  const [universities, setUniversities] = useState([]);
  const [selectedUniversity, setSelectedUniversity] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Step 3 state
  const [major, setMajor] = useState('');
  const [course, setCourse] = useState('1');
  const [document, setDocument] = useState(null);
  const [userId, setUserId] = useState(null);

  const [emailConfirmationNeeded, setEmailConfirmationNeeded] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Resume logic: check if user is already logged in and determine step
  useEffect(() => {
    const checkResumeState = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // User is logged in, determine which step to show
        const { data: profile } = await supabase
          .from('profiles')
          .select('university_id')
          .eq('id', user.id)
          .single();

        if (!profile || !profile.university_id) {
          // No university set, go to step 2
          setStep(2);
        } else {
          // University is set, check verification status
          const { data: verificationReq } = await supabase
            .from('verification_requests')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (!verificationReq) {
            // No verification request, go to step 3
            setStep(3);
            setSelectedUniversity({ id: profile.university_id });
          } else {
            // Already verified or pending, redirect to feed
            router.push('/feed');
            return;
          }
        }
        setUserId(user.id);
      } else {
        // Not logged in, check URL params
        const stepParam = searchParams.get('step');
        if (stepParam) {
          setStep(parseInt(stepParam));
        }
      }
      setInitializing(false);
    };

    checkResumeState();
  }, [searchParams, router]);

  useEffect(() => {
    if (step === 2) {
      fetchUniversities();
    }
  }, [step]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.body.classList.toggle('dark', next);
  };

  const fetchUniversities = async () => {
    const { data, error } = await supabase
      .from('universities')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setUniversities(data);
    }
  };

  const handleStep1 = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('register.errorPasswordMismatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('register.errorPasswordLength'));
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError(t('register.errorAlreadyRegistered'));
        } else {
          setError(t('register.errorGeneric'));
        }
        setLoading(false);
        return;
      }

      if (data.user && !data.session) {
        setEmailConfirmationNeeded(true);
        setLoading(false);
        return;
      }

      if (data.user) {
        setUserId(data.user.id);
        setStep(2);
        window.history.pushState({}, '', '/register?step=2');
      }
      setLoading(false);
    } catch (err) {
      setError(t('register.errorNetwork'));
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!selectedUniversity) {
      setError(t('register.errorSelectUniversity'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError(t('register.errorSessionExpired'));
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ university_id: selectedUniversity.id })
        .eq('id', user.id);

      if (updateError) {
        setError(t('register.errorProfileUpdate'));
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setStep(3);
      window.history.pushState({}, '', '/register?step=3');
      setLoading(false);
    } catch (err) {
      setError(t('register.errorGeneric'));
      setLoading(false);
    }
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    setError('');

    if (!document) {
      setError(t('register.errorUploadDocument'));
      return;
    }

    if (!major.trim()) {
      setError(t('register.errorEnterMajor'));
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError(t('register.errorSessionExpired'));
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          major: major.trim(),
          course: parseInt(course)
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
      }

      const fileExt = document.name.split('.').pop();
      const fileName = `${user.id}/document.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verifications')
        .upload(fileName, document, { upsert: true });

      if (uploadError) {
        setError(t('register.errorFileUpload'));
        setLoading(false);
        return;
      }

      // Store the clean relative path from upload response
      const cleanPath = uploadData?.path || fileName;

      const { error: requestError } = await supabase
        .from('verification_requests')
        .insert({
          user_id: user.id,
          document_url: cleanPath,
          status: 'pending',
        });

      if (requestError) {
        setError(t('register.errorVerificationRequest'));
        setLoading(false);
        return;
      }

      router.push('/feed');
    } catch (err) {
      setError(t('register.errorGeneric'));
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError(t('register.errorFileSize'));
        return;
      }
      setDocument(file);
      setError('');
    }
  };

  const filteredUniversities = universities.filter(u =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.short_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (initializing) {
    return (
      <div className="auth-loading-screen">
        {t('common.loading')}
      </div>
    );
  }

  if (emailConfirmationNeeded) {
    return (
      <div className="auth">
        <div className="auth-side">
          <Constellation />
          <div className="auth-logo-wrap">
            <Logo size={40} wordSize={24} white />
          </div>
          <h2>{t('register.emailConfirmSideTitle')}</h2>
          <p className="q">{t('register.emailConfirmSideText')}</p>
        </div>
        <div className="auth-form">
          <div className="auth-box">
            <h1>{t('register.emailConfirmTitle')}</h1>
            <p className="sub">
              {t('register.emailConfirmSubtitle')}
            </p>
            <div className="auth-confirm-panel">
              <p className="auth-confirm-line">
                <b>{email}</b>
              </p>
              <p className="auth-confirm-line">
                {t('register.emailConfirmStep1')}<br />
                {t('register.emailConfirmStep2')}<br />
                {t('register.emailConfirmStep3')}
              </p>
            </div>
            <Link href="/login" className="btn btn-red btn-block">
              {t('register.emailConfirmed')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-side">
        <Constellation />
        <div className="auth-logo-wrap">
          <Logo size={40} wordSize={24} white />
        </div>
        {step === 1 && (
          <>
            <h2>{t('register.side1Title')}</h2>
            <p className="q">{t('register.side1Text')}</p>
          </>
        )}
        {step === 2 && (
          <>
            <h2>{t('register.side2Title')}</h2>
            <p className="q">{t('register.side2Text')}</p>
          </>
        )}
        {step === 3 && (
          <>
            <h2>{t('register.side3Title')}</h2>
            <p className="q">{t('register.side3Text')}</p>
          </>
        )}
      </div>

      <div className="auth-form">
        <div className={`auth-box ${step === 2 ? 'wide' : ''}`}>
          <div className="auth-tools">
            <div className="lang">
              <button type="button" className={lang === 'kk' ? 'on' : ''} onClick={() => setLang('kk')}>ҚАЗ</button>
              <button type="button" className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>РУС</button>
              <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>ENG</button>
            </div>
            <button type="button" className="theme-btn" onClick={toggleTheme} title={t('common.theme')} aria-label={t('common.themeToggle')}>
              {dark ? <Moon size={20} strokeWidth={1.75} color="currentColor" /> : <Sun size={20} strokeWidth={1.75} color="currentColor" />}
            </button>
          </div>

          <h1>{t('register.title')}</h1>
          <p className="sub">
            {step === 1 && t('register.step1Title')}
            {step === 2 && t('register.step2Title')}
            {step === 3 && t('register.step3Title')}
          </p>

          <div className="wizard">
            <div className={`wstep ${step === 1 ? 'now' : 'done'}`}>
              <div className="bar"></div>{t('register.stepAccount')}
            </div>
            <div className={`wstep ${step === 2 ? 'now' : step > 2 ? 'done' : ''}`}>
              <div className="bar"></div>{t('register.stepUniversity')}
            </div>
            <div className={`wstep ${step === 3 ? 'now' : ''}`}>
              <div className="bar"></div>{t('register.stepVerification')}
            </div>
          </div>

          {error && (
            <div className="error-msg">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1}>
              <div className="row2">
                <div className="field">
                  <label>{t('register.firstName')}</label>
                  <input
                    placeholder={t('register.firstNamePlaceholder')}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="field">
                  <label>{t('register.lastName')}</label>
                  <input
                    placeholder={t('register.lastNamePlaceholder')}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="field">
                <label>{t('register.email')}</label>
                <input
                  type="email"
                  placeholder={t('register.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <p className="hint">{t('register.hint')}</p>
              <div className="field">
                <label>{t('register.password')}</label>
                <input
                  type="password"
                  placeholder={t('register.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>{t('register.confirmPassword')}</label>
                <input
                  type="password"
                  placeholder={t('register.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <button type="submit" className="btn btn-red btn-block" disabled={loading}>
                {loading ? t('register.loading') : t('register.continueBtn')}
              </button>
              <p className="auth-center-note">
                {t('register.hasAccount')} <Link className="link" href="/login">{t('register.loginLink')}</Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <>
              <div className="field">
                <input
                  placeholder={t('register.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="upick">
                {filteredUniversities.map((uni) => (
                  <div
                    key={uni.id}
                    className={`uopt ${selectedUniversity?.id === uni.id ? 'sel' : ''}`}
                    onClick={() => setSelectedUniversity(uni)}
                  >
                    <div className="ul" style={{ background: uni.brand_color }}>
                      {uni.short_name}
                    </div>
                    <div>
                      <h4>{uni.name}</h4>
                      <div className="m">{uni.city}</div>
                    </div>
                    <div className="rd"></div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-red btn-block"
                onClick={handleStep2}
                disabled={loading || !selectedUniversity}
              >
                {loading ? t('register.loading') : t('register.continueBtn')}
              </button>
              <p className="auth-muted-note">
                {t('register.uniNotListed')} <a className="link" href="#">{t('register.contactUs')}</a> {t('register.willAdd')}
              </p>
            </>
          )}

          {step === 3 && (
            <form onSubmit={handleStep3}>
              <div className="row2">
                <div className="field">
                  <label>{t('register.university')}</label>
                  <input value={selectedUniversity?.short_name || ''} disabled />
                </div>
                <div className="field">
                  <label>{t('register.course')}</label>
                  <select value={course} onChange={(e) => setCourse(e.target.value)}>
                    <option value="1">{t('register.course1')}</option>
                    <option value="2">{t('register.course2')}</option>
                    <option value="3">{t('register.course3')}</option>
                    <option value="4">{t('register.course4')}</option>
                    <option value="5">{t('register.course5')}</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>{t('register.major')}</label>
                <input
                  placeholder={t('register.majorPlaceholder')}
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>{t('register.document')}</label>
                <label htmlFor="file-upload" className="upload">
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="file-input-hidden"
                  />
                  {document ? (
                    <span>{t('register.documentSelected')} {document.name}</span>
                  ) : (
                    <>
                      {t('register.uploadText')} <b>{t('register.uploadBold')}</b>
                      <br />
                      <span className="upload-hint">{t('register.uploadHint')}</span>
                    </>
                  )}
                </label>
              </div>
              <button type="submit" className="btn btn-red btn-block" disabled={loading}>
                {loading ? t('register.uploading') : t('register.submitBtn')}
              </button>
              <p className="auth-muted-note">
                {t('register.verificationNotice')}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Constellation() {
  return (
    <svg className="constel" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
        <line x1="140" y1="120" x2="330" y2="70" />
        <line x1="330" y1="70" x2="410" y2="240" />
        <line x1="140" y1="120" x2="250" y2="330" />
        <line x1="250" y1="330" x2="410" y2="240" />
        <line x1="1120" y1="90" x2="1300" y2="170" />
        <line x1="1300" y1="170" x2="1210" y2="360" />
        <line x1="1120" y1="90" x2="1210" y2="360" />
        <line x1="980" y1="420" x2="1210" y2="360" />
        <line x1="620" y1="480" x2="820" y2="520" />
      </g>
      <g fill="#fff">
        <circle cx="140" cy="120" r="9" />
        <circle cx="330" cy="70" r="7" />
        <circle cx="410" cy="240" r="8" />
        <circle cx="250" cy="330" r="7" />
        <circle cx="1120" cy="90" r="8" />
        <circle cx="1300" cy="170" r="7" />
        <circle cx="1210" cy="360" r="9" />
        <circle cx="980" cy="420" r="7" />
        <circle cx="620" cy="480" r="7" />
        <circle cx="820" cy="520" r="8" />
      </g>
    </svg>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="auth-loading-screen">Loading...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
