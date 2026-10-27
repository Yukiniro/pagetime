import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CaretDown, Code, GithubLogo, Laptop, LockSimple, Translate, X } from '@phosphor-icons/react';
import { Button } from '../src/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../src/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '../src/components/ui/dropdown-menu';
import { docLinks, REPO_URL } from '../src/docs-links.mjs';
import { duration, formatDate, languages, timeLabel } from './i18n.js';
import dashboardZh from './assets/dashboard.webp';
import dashboardEn from './assets/dashboard-en.webp';
import timelineImage from './assets/timeline.webp';
import { HomeDetails, HomeFeatures, InstallSteps } from './home-details.jsx';

function HomeLanguage() {
  const { t, i18n } = useTranslation();
  const languageName = languages.find(([code]) => code === i18n.resolvedLanguage)?.[1];
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" className="home-language" />} aria-label={t('language.label', { language: languageName })}><Translate aria-hidden="true" />{languageName}<CaretDown aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-auto min-w-40"><DropdownMenuRadioGroup value={i18n.resolvedLanguage} onValueChange={value => i18n.changeLanguage(value)}>
      {languages.map(([code, name]) => <DropdownMenuRadioItem closeOnClick key={code} value={code}>{name}</DropdownMenuRadioItem>)}
    </DropdownMenuRadioGroup></DropdownMenuContent>
  </DropdownMenu>;
}

export function Home() {
  const { t, i18n } = useTranslation();
  const [installOpen, setInstallOpen] = useState(false);
  const docs = docLinks(i18n.resolvedLanguage);
  const dashboardImage = i18n.resolvedLanguage.startsWith('zh') ? dashboardZh : dashboardEn;
  const exampleDay = new Date(2026, 9, 24);
  useEffect(() => {
    document.title = t('home.title');
    document.querySelector('meta[name="description"]').content = t('home.description');
  }, [t]);

  return <div className="home-page" id="top">
    <a className="home-skip" href="#content">{t('home.skip')}</a>
    <header className="home-header">
      <div className="home-container home-header-inner">
        <a href="#top" className="home-brand" aria-label="PageTime"><img src="/icon/96.png" width="32" height="32" alt="" />PageTime</a>
        <nav aria-label={t('nav.label')} className="home-nav">
          <a href="#features">{t('home.features')}</a>
          <a href="#privacy">{t('home.privacy')}</a>
          <a href="#install">{t('home.setup.eyebrow')}</a>
          <a href="#faq">{t('home.faq.nav')}</a>
          <a className="home-nav-github" href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          <Button className="home-download home-nav-download" onClick={() => setInstallOpen(true)}>{t('home.download')}</Button>
        </nav>
        <HomeLanguage />
      </div>
    </header>

    <main id="content">
      <section className="home-hero home-container" aria-labelledby="home-heading">
        <h1 id="home-heading"><Trans i18nKey="home.headline" components={{ accent: <em /> }} /></h1>
        <p className="home-subtitle">{t('home.description')}</p>
        <div className="home-hero-actions">
          <Button className="home-download" onClick={() => setInstallOpen(true)}>{t('home.download')}</Button>
          <a className="home-secondary" href={REPO_URL} target="_blank" rel="noopener noreferrer">{t('home.github')}</a>
        </div>
        <p className="home-compatibility">{t('home.compatibility')}</p>
      </section>

      <section className="home-product home-container" aria-label={t('home.features')}>
        <img className="home-dashboard" src={dashboardImage} width="1383" height="1137" alt={t('home.dashboardAlt')} fetchPriority="high" />
      </section>

      <section id="privacy" className="home-trust home-container" aria-label={t('home.privacy')}>
        {[['local', Laptop], ['account', LockSimple], ['open', Code]].map(([key, Icon]) => <div className="home-trust-item" key={key}>
          <span className="home-trust-icon"><Icon size={26} aria-hidden="true" /></span>
          <div><h2>{t(`home.trust.${key}.title`)}</h2><p>{t(`home.trust.${key}.description`)}</p></div>
        </div>)}
      </section>

      <HomeFeatures dashboardImage={dashboardImage} />

      <section className="home-story home-container" aria-labelledby="home-story-heading">
        <h2 id="home-story-heading">{t('home.timelineTitle')}</h2>
        <p>{t('home.timelineDescription')}</p>
        <figure className="home-timeline">
          <figcaption><span>{formatDate(exampleDay, { month: 'long', day: 'numeric', weekday: 'short' })}</span><span>{t('home.timelineTotal', { duration: duration((4 * 60 + 32) * 60_000) })}</span></figcaption>
          <div className="home-timeline-track"><img src={timelineImage} width="2243" height="701" alt={t('home.timelineAlt')} loading="lazy" /></div>
          <div className="home-time-axis" aria-hidden="true">{[0, 6, 12, 18].map(hour => <span key={hour}>{timeLabel(new Date(2026, 9, 24, hour))}</span>)}<span>{timeLabel(new Date(2026, 9, 25))}</span></div>
          <div className="home-timeline-legend"><span>{t('home.timelineActive')}</span><span>{t('home.timelineIdle')}</span></div>
        </figure>
      </section>
      <HomeDetails onInstall={() => setInstallOpen(true)} />
    </main>

    <footer className="home-footer home-container">
      <a className="home-footer-brand" href="#top">PageTime</a>
      <div className="home-footer-links">
        <a href={docs.privacy} target="_blank" rel="noopener noreferrer">{t('docs.privacy')}</a>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        <HomeLanguage />
      </div>
    </footer>

    <Dialog open={installOpen} onOpenChange={setInstallOpen}>
      <DialogContent className="home-install" showCloseButton={false}>
        <DialogHeader><DialogTitle>{t('home.install.title')}</DialogTitle><DialogDescription>{t('home.install.description')}</DialogDescription></DialogHeader>
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="home-install-close" />} aria-label={t('home.install.close')}><X aria-hidden="true" /></DialogClose>
        <InstallSteps />
        <a className="home-install-source" href={REPO_URL} target="_blank" rel="noopener noreferrer"><GithubLogo aria-hidden="true" />{t('home.github')}</a>
      </DialogContent>
    </Dialog>
  </div>;
}
