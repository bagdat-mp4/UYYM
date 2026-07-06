'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, Upload } from 'lucide-react';
import Logo from '@/components/Logo';
import { supabase } from '@/lib/supabase';
import './register.css';

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Отслеживание email confirmation
  const [emailConfirmationNeeded, setEmailConfirmationNeeded] = useState(false);

  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam) {
      setStep(parseInt(stepParam));
    }
  }, [searchParams]);

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
      setError('Құпиясөздер сәйкес келмейді');
      return;
    }

    if (password.length < 8) {
      setError('Құпиясөз кемінде 8 таңбадан тұруы керек');
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
          setError('Бұл пошта бұрын тіркелген. Кіру бетіне өтіңіз.');
        } else {
          setError('Тіркелу кезінде қате болды. Қайталап көріңіз.');
        }
        setLoading(false);
        return;
      }

      // Проверяем, нужна ли email confirmation
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
      setError('Желі қатесі. Интернет байланысын тексеріңіз.');
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!selectedUniversity) {
      setError('Университетті таңдаңыз');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('Сессия аяқталды. Қайтадан кіріңіз.');
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ university_id: selectedUniversity.id })
        .eq('id', user.id);

      if (updateError) {
        setError('Профильді жаңарту кезінде қате болды');
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setStep(3);
      window.history.pushState({}, '', '/register?step=3');
      setLoading(false);
    } catch (err) {
      setError('Қате болды. Қайталап көріңіз.');
      setLoading(false);
    }
  };

  const handleStep3 = async (e) => {
    e.preventDefault();
    setError('');

    if (!document) {
      setError('Студенттік билет фотосын жүктеңіз');
      return;
    }

    if (!major.trim()) {
      setError('Мамандықты енгізіңіз');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('Сессия аяқталды. Қайтадан кіріңіз.');
        setLoading(false);
        return;
      }

      // Update profile with major and course
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

      // Upload document
      const fileExt = document.name.split('.').pop();
      const fileName = `${user.id}/document.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('verifications')
        .upload(fileName, document, { upsert: true });

      if (uploadError) {
        setError('Файлды жүктеу кезінде қате болды');
        setLoading(false);
        return;
      }

      // Create verification request
      const { error: requestError } = await supabase
        .from('verification_requests')
        .insert({
          user_id: user.id,
          document_url: fileName,
          status: 'pending',
        });

      if (requestError) {
        setError('Өтінім жасау кезінде қате болды');
        setLoading(false);
        return;
      }

      // Success! Redirect to feed
      router.push('/feed');
    } catch (err) {
      setError('Қате болды. Қайталап көріңіз.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('Файл өлшемі 10 МБ аспауы керек');
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

  if (emailConfirmationNeeded) {
    return (
      <div className="auth">
        <div className="auth-side">
          <Constellation />
          <div style={{ position: 'relative' }}>
            <Logo size={40} wordSize={24} white />
          </div>
          <h2>Поштаңызды тексеріңіз!</h2>
          <p className="q">
            {email} адресіне растау хаты жібердік. Хатты ашып, сілтемені басыңыз, содан кейін осы бетке қайтып келіңіз.
          </p>
        </div>
        <div className="auth-form">
          <div className="auth-box">
            <h1>Email растау</h1>
            <p className="sub" style={{ marginBottom: 20 }}>
              Тіркелу үшін поштаңызды растаңыз
            </p>
            <div style={{
              background: 'var(--red-tint)',
              color: 'var(--ink-2)',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '14px',
              marginBottom: '20px',
              lineHeight: 1.6
            }}>
              <p style={{ marginBottom: 10 }}>
                ✉️ <b>{email}</b> поштасына хат жібердік
              </p>
              <p style={{ marginBottom: 10 }}>
                1. Inbox немесе Spam қалтасын тексеріңіз<br />
                2. Хаттағы "Confirm Email" сілтемесін басыңыз<br />
                3. Осы бетке қайтып оралыңыз
              </p>
            </div>
            <Link href="/login" className="btn btn-red" style={{ width: '100%', textAlign: 'center' }}>
              Растадым, кіру бетіне өту
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
        <div style={{ position: 'relative' }}>
          <Logo size={40} wordSize={24} white />
        </div>
        {step === 1 && (
          <>
            <h2>2 минут — және сен Қазақстанның студенттік желісіндесің.</h2>
            <p className="q">600 000+ студент. Бір платформа. Тек шын, расталған адамдар.</p>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Универің — сенің Uyym-дағы қауымың.</h2>
            <p className="q">
              Университетті таңдағанда өз универіңнің лентасына, материалдарына және оқытушылар рейтингіне қол жеткізесің.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h2>Соңғы қадам — студент екеніңді растау.</h2>
            <p className="q">
              Верификация не үшін керек? Uyym-да тек шын студенттер бар — сондықтан мұнда сенім жоғары, спам жоқ.
            </p>
          </>
        )}
      </div>

      <div className="auth-form">
        <div className={`auth-box ${step === 2 ? 'wide' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <div className="lang">
              <span className="on">ҚАЗ</span>
              <span>РУС</span>
              <span>ENG</span>
            </div>
            <button className="theme-btn" onClick={toggleTheme} title="Тақырып" aria-label="Тақырыпты ауыстыру">
              {dark ? <Moon size={20} strokeWidth={2} color="#9BA0B0" /> : <Sun size={20} strokeWidth={2} color="#69728A" />}
            </button>
          </div>

          <h1>Тіркелу</h1>
          <p className="sub">
            {step === 1 && '1-қадам: аккаунт жасау'}
            {step === 2 && '2-қадам: университетіңді таңда'}
            {step === 3 && '3-қадам: студент екеніңді растау'}
          </p>

          <div className="wizard">
            <div className={`wstep ${step === 1 ? 'now' : 'done'}`}>
              <div className="bar"></div>Аккаунт
            </div>
            <div className={`wstep ${step === 2 ? 'now' : step > 2 ? 'done' : ''}`}>
              <div className="bar"></div>Университет
            </div>
            <div className={`wstep ${step === 3 ? 'now' : ''}`}>
              <div className="bar"></div>Верификация
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
                  <label>Аты</label>
                  <input
                    placeholder="Иван"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="field">
                  <label>Тегі</label>
                  <input
                    placeholder="Студентов"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="field">
                <label>Электрондық пошта</label>
                <input
                  type="email"
                  placeholder="student@kbtu.kz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <p className="hint">ЖОО почтаң болса — верификация тезірек өтеді</p>
              <div className="field">
                <label>Құпиясөз</label>
                <input
                  type="password"
                  placeholder="Кемінде 8 таңба"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>Құпиясөзді қайтала</label>
                <input
                  type="password"
                  placeholder="Құпиясөзді қайтала"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <button type="submit" className="btn btn-red" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Күте тұрыңыз...' : 'Жалғастыру'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 14, marginTop: 22 }}>
                Аккаунтың бар ма? <Link className="link" href="/login">Кіру</Link>
              </p>
            </form>
          )}

          {step === 2 && (
            <>
              <div className="field">
                <input
                  placeholder="🔍  Универіңді ізде…"
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
                className="btn btn-red"
                style={{ width: '100%' }}
                onClick={handleStep2}
                disabled={loading || !selectedUniversity}
              >
                {loading ? 'Күте тұрыңыз...' : 'Жалғастыру'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 14 }}>
                Универің тізімде жоқ па? <a className="link" href="#">Бізге хабарла</a> — қосамыз.
              </p>
            </>
          )}

          {step === 3 && (
            <form onSubmit={handleStep3}>
              <div className="row2">
                <div className="field">
                  <label>Университет</label>
                  <input value={selectedUniversity?.short_name || ''} disabled />
                </div>
                <div className="field">
                  <label>Курс</label>
                  <select value={course} onChange={(e) => setCourse(e.target.value)}>
                    <option value="1">1-курс</option>
                    <option value="2">2-курс</option>
                    <option value="3">3-курс</option>
                    <option value="4">4-курс</option>
                    <option value="5">5-курс</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Мамандық</label>
                <input
                  placeholder="Автоматтандыру және басқару"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label>Студенттік билет / анықтама</label>
                <label htmlFor="file-upload" className="upload">
                  <input
                    id="file-upload"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  {document ? (
                    <span>✓ {document.name}</span>
                  ) : (
                    <>
                      Файлды осында тарт немесе <b>таңдау</b>
                      <br />
                      <span style={{ fontSize: 12 }}>JPG, PNG немесе PDF · 10 МБ дейін</span>
                    </>
                  )}
                </label>
              </div>
              <button type="submit" className="btn btn-red" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Жүктелуде...' : 'Растауға жіберу'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)', marginTop: 14 }}>
                Тексеру әдетте 24 сағатқа дейін. Дерек тек верификацияға қолданылады.
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
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Жүктелуде...</div>}>
      <RegisterContent />
    </Suspense>
  );
}
