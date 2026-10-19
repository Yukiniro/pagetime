import { GlobeHemisphereWest } from '@phosphor-icons/react';
import { Avatar, AvatarImage, AvatarFallback } from '@app/components/ui/avatar';
import { iconHost } from './data.js';

export function SiteIcon({ domain, site = domain }) {
  const icon = iconHost(domain, site);
  return <Avatar className="site-icon rounded-none after:hidden">
    {icon && <AvatarImage className="rounded-none object-contain" src={`./assets/${icon}.svg`} alt="" />}
    <AvatarFallback className="rounded-none bg-transparent"><GlobeHemisphereWest size={23} /></AvatarFallback>
  </Avatar>;
}
