import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle, CursorClick, DownloadSimple, Export, ListChecks, PauseCircle } from '@phosphor-icons/react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../src/components/ui/accordion';
import { Button } from '../src/components/ui/button';
import { docLinks, REPO_URL } from '../src/docs-links.mjs';

export function HomeFeatures({ dashboardImage }) {
  const { t } = useTranslation();
  return <section id="features" className="home-features home-container" aria-labelledby="home-features-title">
    <div className="home-section-heading"><span className="home-eyebrow">{t('home.details.eyebrow')}</span><h2 id="home-features-title">{t('home.details.title')}</h2><p>{t('home.details.description')}</p></div>
    <div className="home-spotlight">
      <div className="home-spotlight-copy"><h3>{t('home.details.rankingTitle')}</h3><p>{t('home.details.rankingDescription')}</p>
        <ul>{['range', 'site', 'visits'].map(key => <li key={key}><CheckCircle aria-hidden="true" size={20} /><span>{t(`home.details.points.${key}`)}</span></li>)}</ul>
      </div>
      <figure className="home-ranking-figure"><div className="home-ranking-crop"><img src={dashboardImage} alt={t('home.details.rankingAlt')} loading="lazy" /></div><figcaption>{t('home.details.rankingCaption')}</figcaption></figure>
    </div>
    <div className="home-capabilities">{[['popup', CursorClick], ['scope', ListChecks], ['pause', PauseCircle], ['export', Export]].map(([key, Icon]) => <article key={key}>
      <Icon size={24} aria-hidden="true" /><h3>{t(`home.details.capabilities.${key}.title`)}</h3><p>{t(`home.details.capabilities.${key}.description`)}</p>
    </article>)}</div>
  </section>;
}

export function InstallSteps() {
  const { t } = useTranslation();
  return <ol className="home-install-steps">
    <li><h3>{t('home.install.getTitle')}</h3><p>{t('home.install.getDescription')}</p><a className="home-install-link" href={`${REPO_URL}/releases/latest`} target="_blank" rel="noopener noreferrer"><DownloadSimple aria-hidden="true" />{t('home.install.release')}</a></li>
    <li><h3>{t('home.install.openTitle')}</h3><p>{t('home.install.openDescription')}</p><div className="home-install-addresses"><code>chrome://extensions</code><code>edge://extensions</code></div></li>
    <li><h3>{t('home.install.loadTitle')}</h3><p>{t('home.install.loadDescription')}</p></li>
  </ol>;
}

export function HomeDetails({ onInstall }) {
  const { t, i18n } = useTranslation();
  const docs = docLinks(i18n.resolvedLanguage);
  return <>
    <section id="install" className="home-setup home-container" aria-labelledby="home-setup-title">
      <div className="home-section-heading"><span className="home-eyebrow">{t('home.setup.eyebrow')}</span><h2 id="home-setup-title">{t('home.setup.title')}</h2><p>{t('home.install.description')}</p></div>
      <InstallSteps />
      <p className="home-update-note">{t('home.setup.update')}</p>
    </section>
    <section id="faq" className="home-faq home-container" aria-labelledby="home-faq-title">
      <div className="home-section-heading"><span className="home-eyebrow">{t('home.faq.eyebrow')}</span><h2 id="home-faq-title">{t('home.faq.title')}</h2><p>{t('home.faq.description')}</p></div>
      <Accordion className="home-faq-list">{['browsers', 'privacy', 'history', 'backup', 'empty'].map(key => <AccordionItem key={key} value={key}>
        <AccordionTrigger>{t(`home.faq.${key}.question`)}</AccordionTrigger>
        <AccordionContent><p>{t(`home.faq.${key}.answer`)}</p></AccordionContent>
      </AccordionItem>)}</Accordion>
      <p className="home-faq-links"><a href={docs.timing} target="_blank" rel="noopener noreferrer">{t('docs.timing')}</a><a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">{t('home.faq.support')}<ArrowRight aria-hidden="true" size={14} /></a></p>
    </section>
    <section className="home-closing home-container" aria-labelledby="home-closing-title"><div><h2 id="home-closing-title">{t('home.closing.title')}</h2><p>{t('home.closing.description')}</p></div><Button className="home-download" onClick={onInstall}>{t('home.download')}<ArrowRight aria-hidden="true" /></Button></section>
  </>;
}
