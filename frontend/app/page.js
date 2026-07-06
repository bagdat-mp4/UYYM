'use client';

import Header from '@/components/Header';
import Logo from '@/components/Logo';
import WaitlistForm from '@/components/WaitlistForm';
import { ShieldCheck, Star, Layers, Users, CalendarDays, Target } from 'lucide-react';
import { useLang } from '@/lib/LanguageProvider';

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

const FEATURES_ICONS = [
  ShieldCheck,
  Star,
  Layers,
  Users,
  CalendarDays,
  Target,
];

const UNIS = [
  { short: 'КБТУ', color: '#1B3A6B', name: 'Қазақстан-Британ ТУ', meta: 'Алматы · техникалық' },
  { short: 'ҚазҰУ', color: '#0F7B4D', name: 'әл-Фараби ҚазҰУ', meta: 'Алматы · классикалық' },
  { short: 'SU', color: '#B7791F', name: 'Satbayev University', meta: 'Алматы · инженерия' },
  { short: 'AITU', color: '#5F3DC4', name: 'Astana IT University', meta: 'Астана · IT' },
  { short: 'NU', color: '#0B7285', name: 'Nazarbayev University', meta: 'Астана · зерттеу' },
  { short: 'KIMEP', color: '#C2255C', name: 'KIMEP University', meta: 'Алматы · бизнес' },
];

export default function Home() {
  const { t } = useLang();

  const FEATURES = [
    { titleKey: 'features.verification.title', textKey: 'features.verification.text', Icon: FEATURES_ICONS[0] },
    { titleKey: 'features.ratings.title', textKey: 'features.ratings.text', Icon: FEATURES_ICONS[1] },
    { titleKey: 'features.materials.title', textKey: 'features.materials.text', Icon: FEATURES_ICONS[2] },
    { titleKey: 'features.networking.title', textKey: 'features.networking.text', Icon: FEATURES_ICONS[3] },
    { titleKey: 'features.events.title', textKey: 'features.events.text', Icon: FEATURES_ICONS[4] },
    { titleKey: 'features.teammates.title', textKey: 'features.teammates.text', Icon: FEATURES_ICONS[5] },
  ];

  const STEPS = [
    { n: 1, titleKey: 'howItWorks.step1.title', textKey: 'howItWorks.step1.text' },
    { n: 2, titleKey: 'howItWorks.step2.title', textKey: 'howItWorks.step2.text' },
    { n: 3, titleKey: 'howItWorks.step3.title', textKey: 'howItWorks.step3.text' },
  ];

  return (
    <>
      <Header />

      <section className="hero">
        <Constellation />
        <div className="chip chip-hero">{t('hero.badge')}</div>
        <h1>{t('hero.title')}</h1>
        <p>{t('hero.subtitle')}</p>
        <div className="cta">
          <a className="btn btn-white" href="#wait">{t('hero.waitlistBtn')}</a>
          <a className="btn btn-line" href="#how">{t('hero.howBtn')}</a>
        </div>
      </section>

      <div className="stats">
        <div className="stat">
          <b>600 000+</b>
          <span>{t('stats.students')}</span>
        </div>
        <div className="stat">
          <b>1-ші</b>
          <span>{t('stats.firstUni')}</span>
        </div>
        <div className="stat">
          <b>100%</b>
          <span>{t('stats.verified')}</span>
        </div>
      </div>

      <section className="feat" id="feat">
        <h2>{t('features.title')}</h2>
        <p className="sub">{t('features.subtitle')}</p>
        <div className="grid3">
          {FEATURES.map((f) => (
            <div className="fcard" key={f.titleKey}>
              <div className="fi">
                <f.Icon size={24} strokeWidth={2} color="#DC2626" />
              </div>
              <h3>{t(f.titleKey)}</h3>
              <p>{t(f.textKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="how" id="how">
        <h2>{t('howItWorks.title')}</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{t(s.titleKey)}</h3>
              <p>{t(s.textKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="unis" id="unis">
        <h2>{t('unis.title')}</h2>
        <p className="sub">{t('unis.subtitle')}</p>
        <div className="grid3" style={{ marginTop: 44 }}>
          {UNIS.map((u, i) => (
            <div className="card" style={{ padding: 22 }} key={u.short}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: u.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 15,
                    fontFamily: 'var(--font-poppins)',
                  }}
                >
                  {u.short}
                </div>
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 3 }}>{u.name}</h3>
                  <div className="mut" style={{ fontSize: 13 }}>
                    {u.meta}
                  </div>
                </div>
              </div>
              <div className="mut" style={{ fontSize: 13 }}>
                {i === 0 ? `● 340 ${t('unis.kbtu')}` : `● ${t('unis.soon')}`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="feat" id="wait">
        <h2>{t('waitlist.title')}</h2>
        <p className="mut" style={{ marginTop: 10 }}>
          {t('waitlist.subtitle')}
        </p>
        <WaitlistForm />
      </section>

      <footer className="foot">
        <Logo size={26} wordSize={16} />
        <span>uyym.app · {t('footer.tagline')} · © 2026</span>
      </footer>
    </>
  );
}
