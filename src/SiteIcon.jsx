import { useEffect, useState } from 'react';
import { GlobeHemisphereWest } from '@phosphor-icons/react';
import { Avatar, AvatarImage, AvatarFallback } from '@app/components/ui/avatar';
import { iconHost, isExtension } from './data.js';
import { cachedFaviconSrc, iconPageHost, iconRequest, localIconPath } from './site-icon.mjs';

function runtimeGetURL() {
  const runtime = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
  return typeof runtime?.getURL === 'function' ? runtime.getURL.bind(runtime) : null;
}

function loadPixels(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) { resolve(null); return; }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        resolve(context.getImageData(0, 0, width, height).data);
      } catch {
        resolve(undefined);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function SiteIcon({ domain, site = domain }) {
  const localName = iconHost(domain, site);
  const host = iconPageHost(domain, site);
  const [src, setSrc] = useState(() => localIconPath(localName));
  useEffect(() => {
    const getURL = isExtension ? runtimeGetURL() : null;
    const next = iconRequest({ localName, extension: isExtension, host, getURL });
    if (!next.probe) {
      setSrc(next.src);
      return undefined;
    }
    setSrc('');
    let live = true;
    cachedFaviconSrc(host, getURL, loadPixels).then(value => { if (live) setSrc(value); });
    return () => { live = false; };
  }, [localName, host]);
  return <Avatar className="site-icon rounded-none after:hidden">
    {src && <AvatarImage className="rounded-none object-contain" src={src} alt="" onLoadingStatusChange={status => {
      if (status === 'error') setSrc(current => current === src ? '' : current);
    }} />}
    <AvatarFallback className="rounded-none bg-transparent"><GlobeHemisphereWest size={23} /></AvatarFallback>
  </Avatar>;
}
